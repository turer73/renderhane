import "server-only";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { refundCredits } from "@/lib/credits/engine";
import {
  cancelJobAndRefund,
  failJobAndRefund,
} from "@/lib/jobs/webhook-transitions";
import {
  reconcileTalkingAvatarTts,
  type TalkingAvatarReconciliationJob,
} from "@/lib/jobs/talking-avatar-reconciliation";
import { completeSocialKitRequest } from "@/lib/jobs/social-kit-idempotency";
import { SOCIAL_KIT_SCENE_COUNT } from "@/lib/fal/models";
import { NextRequest, NextResponse } from "next/server";

const SOCIAL_KIT_JOB_COUNT = SOCIAL_KIT_SCENE_COUNT + 1;
const CLEANUP_SCAN_PAGE_SIZE = 50;
const CLEANUP_SCAN_MAX_PAGES = 10;
const PROVIDER_SUBMISSION_REVIEW_AFTER_MS = 24 * 60 * 60 * 1000;

type MaintenanceScanName =
  | "stuck_jobs"
  | "reserved_transactions"
  | "social_kit_requests";

function parseMaintenancePage<T>(value: unknown): {
  rows: T[];
  cycleComplete: boolean;
  scanTruncated: boolean;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const page = value as Record<string, unknown>;
  if (
    !Array.isArray(page.rows) ||
    typeof page.cycleComplete !== "boolean" ||
    typeof page.scanTruncated !== "boolean"
  ) {
    return null;
  }
  return {
    rows: page.rows as T[],
    cycleComplete: page.cycleComplete,
    scanTruncated: page.scanTruncated,
  };
}

async function takeMaintenancePages<T>(input: {
  supabase: ReturnType<typeof createAdminClient>;
  scanName: MaintenanceScanName;
  cutoff: string;
}) {
  const rows: T[] = [];
  let error: { message: string } | null = null;
  let scanTruncated = false;

  for (let pageIndex = 0; pageIndex < CLEANUP_SCAN_MAX_PAGES; pageIndex++) {
    const { data, error: rpcError } = await input.supabase.rpc(
      "take_maintenance_scan_page",
      {
        p_scan_name: input.scanName,
        p_cutoff: input.cutoff,
        p_limit: CLEANUP_SCAN_PAGE_SIZE,
      }
    );
    if (rpcError) {
      error = rpcError;
      break;
    }

    const page = parseMaintenancePage<T>(data);
    if (!page) {
      error = { message: "invalid maintenance scan response" };
      break;
    }

    rows.push(...page.rows);
    scanTruncated = page.scanTruncated;
    if (page.cycleComplete) break;
    if (pageIndex === CLEANUP_SCAN_MAX_PAGES - 1) scanTruncated = true;
  }

  return { rows, error, scanTruncated };
}

type SocialKitTransaction = {
  id: string;
  user_id: string;
  type: string;
  status: string;
  amount: number;
  job_id: string | null;
};

type SocialKitJob = {
  id: string;
  user_id: string;
  project_id: string | null;
  credit_cost: number;
  credit_tx_id: string | null;
  status: string;
  tool: string;
  error_message: string | null;
};

type SocialKitOutput = {
  id: string;
  job_id: string;
  user_id: string;
  project_id: string | null;
  type: string;
  fal_url: string | null;
  r2_url: string | null;
};

type StuckJobRow = TalkingAvatarReconciliationJob & { created_at: string };

type ReservedTransactionRow = {
  id: string;
  user_id: string | null;
  type: string;
  amount: number;
  created_at: string;
};

type StaleSocialKitRequestRow = {
  id: string;
  user_id: string;
  reservation_ids: unknown;
  created_at: string;
};

type SocialKitFinalOutcome = "succeeded" | "partial" | "failed";

type SocialKitReconciliation =
  | { disposition: "pending" }
  | {
      disposition: "final";
      outcome: SocialKitFinalOutcome;
      responseStatus: number;
      responseBody: Record<string, unknown>;
    };

function hasValidSocialKitJobShape(jobs: SocialKitJob[]): boolean {
  return (
    jobs.every((job) => job.tool === "scene" || job.tool === "video") &&
    jobs.filter((job) => job.tool === "scene").length <=
      SOCIAL_KIT_SCENE_COUNT &&
    jobs.filter((job) => job.tool === "video").length <= 1
  );
}

function hasDurableOutputs(input: {
  requestUserId: string;
  completedJobs: SocialKitJob[];
  outputs: SocialKitOutput[];
}): boolean {
  const { requestUserId, completedJobs, outputs } = input;
  if (
    outputs.length !== completedJobs.length ||
    new Set(outputs.map((output) => output.id)).size !== outputs.length
  ) {
    return false;
  }

  const outputByJob = new Map<string, SocialKitOutput[]>();
  for (const output of outputs) {
    const jobOutputs = outputByJob.get(output.job_id) ?? [];
    jobOutputs.push(output);
    outputByJob.set(output.job_id, jobOutputs);
  }

  return completedJobs.every((job) => {
    const jobOutputs = outputByJob.get(job.id) ?? [];
    if (jobOutputs.length !== 1) return false;
    const output = jobOutputs[0];
    const hasUrl = [output.fal_url, output.r2_url].some(
      (url) => typeof url === "string" && url.trim().length > 0
    );
    return (
      job.user_id === requestUserId &&
      output.job_id === job.id &&
      output.user_id === requestUserId &&
      output.user_id === job.user_id &&
      output.project_id === job.project_id &&
      output.type === (job.tool === "video" ? "video" : "image") &&
      hasUrl
    );
  });
}

function finalSocialKitResponse(input: {
  requestId: string;
  jobs: SocialKitJob[];
  successfulJobs: SocialKitJob[];
  totalCost: number;
  missingJobs: number;
}): SocialKitReconciliation {
  const { requestId, jobs, successfulJobs, totalCost, missingJobs } = input;
  const failedJobs = jobs.filter(
    (job) => job.status === "failed" || job.status === "cancelled"
  );
  const failureCount = failedJobs.length + missingJobs;
  const outcome: SocialKitFinalOutcome =
    successfulJobs.length === SOCIAL_KIT_JOB_COUNT
      ? "succeeded"
      : successfulJobs.length > 0
        ? "partial"
        : "failed";
  const warnings = [
    ...failedJobs.map((job) =>
      job.tool === "video"
        ? "Video generation did not complete"
        : "Scene generation did not complete"
    ),
    ...(missingJobs > 0
      ? [`${missingJobs} Social Kit job${missingJobs === 1 ? "" : "s"} were not created`]
      : []),
  ];
  const responseBody: Record<string, unknown> = {
    outcome,
    requestId,
    jobIds: jobs.map((job) => job.id),
    totalCost,
    estimatedTime: "~3min",
    sceneCount: successfulJobs.filter((job) => job.tool === "scene").length,
    hasVideo: successfulJobs.some((job) => job.tool === "video"),
    completedJobs: successfulJobs.length,
    failedJobs: failureCount,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(outcome === "failed" ? { error: "social_kit_generation_failed" } : {}),
    idempotency: { outcome: "final", keyAction: "rotate" },
  };

  return {
    disposition: "final",
    outcome,
    responseStatus: outcome === "failed" ? 500 : 200,
    responseBody,
  };
}

function reconcilePaidSocialKit(input: {
  requestId: string;
  requestUserId: string;
  reservationIds: string[];
  transactions: SocialKitTransaction[];
  jobs: SocialKitJob[];
  outputs: SocialKitOutput[];
}): SocialKitReconciliation {
  const { requestId, requestUserId, reservationIds, transactions, jobs, outputs } = input;

  if (
    reservationIds.length !== SOCIAL_KIT_JOB_COUNT ||
    new Set(reservationIds).size !== reservationIds.length ||
    transactions.length !== reservationIds.length ||
    new Set(transactions.map((transaction) => transaction.id)).size !==
      transactions.length ||
    jobs.length > SOCIAL_KIT_JOB_COUNT ||
    new Set(jobs.map((job) => job.id)).size !== jobs.length ||
    !hasValidSocialKitJobShape(jobs) ||
    transactions.some(
      (transaction) =>
        transaction.user_id !== requestUserId || transaction.type !== "spend"
    ) ||
    jobs.some(
      (job) =>
        job.user_id !== requestUserId ||
        !Number.isFinite(job.credit_cost) ||
        job.credit_cost < 0
    )
  ) {
    return { disposition: "pending" };
  }

  const transactionById = new Map(
    transactions.map((transaction) => [transaction.id, transaction])
  );
  const jobsByTransaction = new Map<string, SocialKitJob[]>();
  for (const job of jobs) {
    if (!job.credit_tx_id || !transactionById.has(job.credit_tx_id)) {
      return { disposition: "pending" };
    }
    const linkedJobs = jobsByTransaction.get(job.credit_tx_id) ?? [];
    linkedJobs.push(job);
    jobsByTransaction.set(job.credit_tx_id, linkedJobs);
  }

  const successfulJobs: SocialKitJob[] = [];
  let totalCost = 0;
  let missingJobs = 0;

  for (const reservationId of reservationIds) {
    const transaction = transactionById.get(reservationId);
    if (
      !transaction ||
      !Number.isFinite(transaction.amount) ||
      transaction.amount >= 0
    ) {
      return { disposition: "pending" };
    }

    const linkedJobs = jobsByTransaction.get(reservationId) ?? [];
    if (linkedJobs.length > 1) return { disposition: "pending" };
    const job = linkedJobs[0];

    if (transaction.status === "completed") {
      if (
        !job ||
        job.status !== "completed" ||
        transaction.job_id !== job.id ||
        Math.abs(transaction.amount) !== job.credit_cost
      ) {
        return { disposition: "pending" };
      }
      successfulJobs.push(job);
      totalCost += Math.abs(transaction.amount);
      continue;
    }

    if (transaction.status !== "refunded") {
      // A reserved transaction or an active child means provider outcome is
      // still unknown. Keep the semantic guard until job cleanup resolves it.
      return { disposition: "pending" };
    }

    if (!job) {
      if (transaction.job_id !== null) return { disposition: "pending" };
      missingJobs++;
      continue;
    }
    if (
      transaction.job_id !== job.id ||
      Math.abs(transaction.amount) !== job.credit_cost ||
      (job.status !== "failed" && job.status !== "cancelled")
    ) {
      return { disposition: "pending" };
    }
  }

  if (!hasDurableOutputs({ requestUserId, completedJobs: successfulJobs, outputs })) {
    return { disposition: "pending" };
  }

  return finalSocialKitResponse({
    requestId,
    jobs,
    successfulJobs,
    totalCost,
    missingJobs,
  });
}

function reconcileFreeSocialKit(input: {
  requestId: string;
  requestUserId: string;
  jobs: SocialKitJob[];
  outputs: SocialKitOutput[];
}): SocialKitReconciliation {
  const { requestId, requestUserId, jobs, outputs } = input;
  if (
    jobs.length > SOCIAL_KIT_JOB_COUNT ||
    new Set(jobs.map((job) => job.id)).size !== jobs.length ||
    !hasValidSocialKitJobShape(jobs) ||
    jobs.some(
      (job) =>
        job.user_id !== requestUserId ||
        job.credit_cost !== 0 ||
        job.credit_tx_id !== null ||
        (job.status !== "completed" &&
          job.status !== "failed" &&
          job.status !== "cancelled")
    )
  ) {
    return { disposition: "pending" };
  }

  const successfulJobs = jobs.filter((job) => job.status === "completed");
  if (!hasDurableOutputs({ requestUserId, completedJobs: successfulJobs, outputs })) {
    return { disposition: "pending" };
  }
  return finalSocialKitResponse({
    requestId,
    jobs,
    successfulJobs,
    totalCost: 0,
    missingJobs: SOCIAL_KIT_JOB_COUNT - jobs.length,
  });
}

/**
 * Cron: Clean up stuck jobs.
 *
 * Finds jobs stuck in "processing"/"pending" for >30 minutes (webhook never
 * arrived), plus reserved credit transactions that were never linked to a job
 * because a multi-job process exited during setup. Refunds credits and marks
 * stuck jobs as failed. The 30-min cutoff leaves headroom for legitimately long
 * jobs (e.g. premium 3D).
 *
 * Schedule: daily — vercel.json "0 0 * * *". Vercel Hobby plan limits crons to
 * once/day, so cleanup latency is up to ~24h (acceptable for stuck-job GC).
 * Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization") || "";
  const expected = `Bearer ${process.env.CRON_SECRET || ""}`;
  const authBuf = Buffer.from(authHeader);
  const expectedBuf = Buffer.from(expected);
  if (
    !process.env.CRON_SECRET ||
    authBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(authBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago (headroom for long jobs)

  // Keyset-scan multiple pages so the oldest provider-pending rows cannot
  // permanently hide later jobs that are safe to terminalize.
  const stuckJobScan = await takeMaintenancePages<StuckJobRow>({
    supabase,
    scanName: "stuck_jobs",
    cutoff,
  });
  const stuckJobs = stuckJobScan.rows;
  const stuckJobsError = stuckJobScan.error;
  const stuckJobsScanTruncated = stuckJobScan.scanTruncated;

  let refunded = 0;
  let failed = 0;
  let repaired = 0;
  let refundRetryPending = 0;
  let providerReconciliationPending = 0;
  let providerTtsResubmitted = 0;
  let providerTtsTerminalized = 0;
  let providerSubmissionReviewRequired = 0;

  if (stuckJobsError) {
    console.error(
      "[stuck-jobs] Failed to query stuck jobs:",
      stuckJobsError.message
    );
  }

  for (const job of stuckJobs) {
    const originalRequest =
      job.original_request && typeof job.original_request === "object"
        ? (job.original_request as Record<string, unknown>)
        : null;
    const providerReconciliation =
      originalRequest?.providerReconciliation &&
      typeof originalRequest.providerReconciliation === "object"
        ? (originalRequest.providerReconciliation as Record<string, unknown>)
        : null;
    const hasProviderSubmissionAttempt =
      typeof job.fal_request_id === "string" ||
      providerReconciliation?.state === "submission_attempted" ||
      providerReconciliation?.state === "accepted";

    if (
      providerReconciliation?.state === "submission_attempted" &&
      job.fal_request_id === null
    ) {
      const updatedAt =
        typeof providerReconciliation.updatedAt === "string"
          ? Date.parse(providerReconciliation.updatedAt)
          : Number.NaN;
      const acknowledgementCutoff =
        Date.now() - PROVIDER_SUBMISSION_REVIEW_AFTER_MS;

      if (Number.isFinite(updatedAt) && updatedAt < acknowledgementCutoff) {
        // The queue request may have been accepted even though its response and
        // request ID were lost. Age is not terminal provider evidence, so an
        // automatic refund here could turn a paid provider side effect into a
        // free retry. Keep the reservation held and surface an explicit manual
        // reconciliation signal instead.
        providerSubmissionReviewRequired++;
        providerReconciliationPending++;
        console.error(
          `[stuck-jobs] Provider submission outcome requires manual review for ${job.id}`
        );
        continue;
      }
    }

    if (
      providerReconciliation?.stage === "tts" &&
      providerReconciliation.state === "accepted" &&
      typeof job.fal_request_id === "string"
    ) {
      try {
        const outcome = await reconcileTalkingAvatarTts(
          job as TalkingAvatarReconciliationJob
        );
        if (outcome === "main_resubmitted") {
          providerTtsResubmitted++;
        } else if (outcome === "failed_refunded" || outcome === "terminal") {
          providerTtsTerminalized++;
        } else {
          providerReconciliationPending++;
        }
      } catch (reconciliationError) {
        providerReconciliationPending++;
        console.error(
          `[stuck-jobs] Failed to resume talking-avatar TTS for ${job.id}:`,
          reconciliationError
        );
      }
      continue;
    }

    // A provider call may have been accepted even when submit/poll transport
    // failed. Without a definitive provider result, refunding here would both
    // give credits back and allow the external paid job to finish. Keep these
    // jobs visible for provider/manual reconciliation instead.
    if (hasProviderSubmissionAttempt) {
      providerReconciliationPending++;
      continue;
    }

    try {
      const disposition = await failJobAndRefund({
        jobId: job.id,
        errorMessage: "Processing timeout — credits refunded automatically",
        staleBefore: cutoff,
      });

      if (disposition === "failed_refunded") {
        refunded++;
        failed++;
      } else if (disposition === "failed_no_charge") {
        failed++;
      } else if (disposition === "output_repaired") {
        repaired++;
      }
    } catch (err) {
      refundRetryPending++;
      console.error(`[stuck-jobs] Failed to clean job ${job.id}:`, err);
    }
  }

  if (failed > 0) {
    console.log(`[stuck-jobs] Cleaned ${failed} stuck jobs, refunded ${refunded} credit transactions`);
  }

  // A process can exit after an atomic bundle reservation but before every
  // child job row is inserted. Reserved transactions are linked from
  // jobs.credit_tx_id immediately, so a reservation older than the cutoff with
  // no matching job is safe to refund.
  let orphanRefunded = 0;
  let orphanValidationPending = 0;
  let terminalRefunded = 0;
  const reservationScan =
    await takeMaintenancePages<ReservedTransactionRow>({
      supabase,
      scanName: "reserved_transactions",
      cutoff,
    });
  const oldReservations = reservationScan.rows;
  const reservationError = reservationScan.error;
  const reservationScanTruncated = reservationScan.scanTruncated;

  if (reservationError) {
    console.error(
      "[stuck-jobs] Failed to query orphan reservations:",
      reservationError.message
    );
  } else if (oldReservations.length > 0) {
    const reservationIds = oldReservations.flatMap((transaction) => {
      if (
        typeof transaction.id !== "string" ||
        typeof transaction.user_id !== "string" ||
        transaction.user_id.trim().length === 0 ||
        transaction.type !== "spend" ||
        !Number.isFinite(transaction.amount) ||
        transaction.amount >= 0
      ) {
        orphanValidationPending++;
        return [];
      }
      return [transaction.id];
    });
    if (reservationIds.length === 0) {
      console.error(
        "[stuck-jobs] No old reservations passed orphan refund validation"
      );
    } else {
    const linkedJobs: Array<{
      id: string;
      credit_tx_id: string | null;
      status: string;
    }> = [];
    let linkedJobsError: { message: string } | null = null;
    for (
      let offset = 0;
      offset < reservationIds.length;
      offset += CLEANUP_SCAN_PAGE_SIZE
    ) {
      const chunk = reservationIds.slice(
        offset,
        offset + CLEANUP_SCAN_PAGE_SIZE
      );
      const { data, error } = await supabase
        .from("jobs")
        .select("id, credit_tx_id, status")
        .in("credit_tx_id", chunk);
      if (error) {
        linkedJobsError = error;
        break;
      }
      linkedJobs.push(
        ...((data ?? []) as Array<{
          id: string;
          credit_tx_id: string | null;
          status: string;
        }> )
      );
    }

    if (linkedJobsError) {
      // Fail closed: never refund when linkage could not be verified.
      console.error(
        "[stuck-jobs] Failed to verify reservation links:",
        linkedJobsError.message
      );
    } else {
      const linkedJobsByTransaction = new Map<
        string,
        Array<{ id: string; status: string }>
      >();
      for (const job of linkedJobs) {
        if (!job.credit_tx_id) continue;
        const jobs = linkedJobsByTransaction.get(job.credit_tx_id) ?? [];
        jobs.push({ id: job.id, status: job.status });
        linkedJobsByTransaction.set(job.credit_tx_id, jobs);
      }

      for (const transactionId of reservationIds) {
        const jobs = linkedJobsByTransaction.get(transactionId) ?? [];
        const isOrphan = jobs.length === 0;
        const isSingleTerminalReservation =
          jobs.length === 1 &&
          (jobs[0].status === "failed" || jobs[0].status === "cancelled");

        // Active/completed/cancelled jobs are deliberately fail-closed. Their
        // charging policy or completion reconciliation must be handled by the
        // owning workflow, never guessed by this garbage collector.
        if (!isOrphan && !isSingleTerminalReservation) continue;

        try {
          if (isOrphan) {
            await refundCredits(transactionId);
            orphanRefunded++;
          } else {
            // Never refund a job-linked reservation by transaction ID alone.
            // The RPC re-locks the job, validates amount/type/ownership, and
            // repairs an already durable output instead of refunding it.
            if (jobs[0].status === "cancelled") {
              const disposition = await cancelJobAndRefund({
                jobId: jobs[0].id,
                reason: "Legacy cancelled job credit reconciliation",
                expectedProviderRequestId: null,
              });
              if (disposition === "cancelled_refunded") terminalRefunded++;
            } else {
              const disposition = await failJobAndRefund({
                jobId: jobs[0].id,
                errorMessage: "Failed job credit reconciliation",
              });
              if (disposition === "failed_refunded") terminalRefunded++;
              else if (disposition === "output_repaired") repaired++;
            }
          }
        } catch (refundError) {
          refundRetryPending++;
          console.error(
            `[stuck-jobs] Failed to reconcile reservation ${transactionId}:`,
            refundError
          );
        }
      }
    }
    }
  }

  // A stale request may already own reservations/provider jobs. Reconstruct a
  // durable terminal response only after every expected child is terminal and
  // its ledger agrees. Pending/processing jobs, reserved credits, incomplete
  // linkage, or malformed snapshots all keep the semantic guard active.
  let expiredRequestCount = 0;
  let reconciledRequestCount = 0;
  let succeededRequestCount = 0;
  let partialRequestCount = 0;
  let failedRequestCount = 0;
  let requestReconciliationPending = 0;
  const requestScan =
    await takeMaintenancePages<StaleSocialKitRequestRow>({
      supabase,
      scanName: "social_kit_requests",
      cutoff,
    });
  const staleRequests = requestScan.rows;
  const reconciliationError = requestScan.error;
  const requestScanTruncated = requestScan.scanTruncated;

  if (reconciliationError) {
    // During a migration-first rollout, the old database may not have this
    // additive table yet. The paid endpoint independently fails closed.
    console.error(
      "[stuck-jobs] Failed to reconcile stale Social Kit requests:",
      reconciliationError.message
    );
  } else {
    for (const staleRequest of staleRequests) {
      if (
        !Array.isArray(staleRequest.reservation_ids) ||
        staleRequest.reservation_ids.some(
          (reservationId) => typeof reservationId !== "string"
        ) ||
        typeof staleRequest.user_id !== "string"
      ) {
        requestReconciliationPending++;
        continue;
      }
      const reservationIds = staleRequest.reservation_ids as string[];

      let transactions: SocialKitTransaction[] = [];
      if (reservationIds.length > 0) {
        const { data, error: transactionError } = await supabase
          .from("credit_transactions")
          .select("id, user_id, type, status, amount, job_id")
          .in("id", reservationIds);

        if (transactionError) {
          requestReconciliationPending++;
          console.error(
            `[stuck-jobs] Could not verify request ${staleRequest.id} reservations:`,
            transactionError.message
          );
          continue;
        }
        transactions = (data ?? []) as SocialKitTransaction[];
      }

      const { data: requestJobs, error: requestJobsError } =
        reservationIds.length > 0
          ? await supabase
              .from("jobs")
              .select("id, user_id, project_id, credit_cost, credit_tx_id, status, tool, error_message")
              .in("credit_tx_id", reservationIds)
          : await supabase
              .from("jobs")
              .select("id, user_id, project_id, credit_cost, credit_tx_id, status, tool, error_message")
              .contains("original_request", {
                orchestrationRequestId: staleRequest.id,
              });

      if (requestJobsError) {
        requestReconciliationPending++;
        console.error(
          `[stuck-jobs] Could not verify request ${staleRequest.id} jobs:`,
          requestJobsError.message
        );
        continue;
      }

      const jobs = (requestJobs ?? []) as SocialKitJob[];
      const completedJobIds = jobs
        .filter((job) => job.status === "completed")
        .map((job) => job.id);
      let outputs: SocialKitOutput[] = [];
      if (completedJobIds.length > 0) {
        const { data, error: outputsError } = await supabase
          .from("outputs")
          .select("id, job_id, user_id, project_id, type, fal_url, r2_url")
          .in("job_id", completedJobIds);
        if (outputsError) {
          requestReconciliationPending++;
          console.error(
            `[stuck-jobs] Could not verify request ${staleRequest.id} outputs:`,
            outputsError.message
          );
          continue;
        }
        outputs = (data ?? []) as SocialKitOutput[];
      }

      const reconciliation =
        reservationIds.length > 0
          ? reconcilePaidSocialKit({
              requestId: staleRequest.id,
              requestUserId: staleRequest.user_id,
              reservationIds,
              transactions,
              jobs,
              outputs,
            })
          : reconcileFreeSocialKit({
              requestId: staleRequest.id,
              requestUserId: staleRequest.user_id,
              jobs,
              outputs,
            });

      if (reconciliation.disposition === "pending") {
        requestReconciliationPending++;
        continue;
      }

      try {
        await completeSocialKitRequest({
          requestId: staleRequest.id,
          userId: staleRequest.user_id,
          responseStatus: reconciliation.responseStatus,
          responseBody: reconciliation.responseBody,
          responseHeaders: {},
        });
      } catch (completionError) {
        requestReconciliationPending++;
        console.error(
          `[stuck-jobs] Failed to finalize Social Kit request ${staleRequest.id}:`,
          completionError
        );
        continue;
      }

      reconciledRequestCount++;
      if (reconciliation.outcome === "succeeded") {
        succeededRequestCount++;
      } else if (reconciliation.outcome === "partial") {
        partialRequestCount++;
      } else {
        failedRequestCount++;
        expiredRequestCount++;
      }
    }
  }

  return NextResponse.json({
    cleaned: failed,
    refunded,
    orphanRefunded,
    orphanValidationPending,
    terminalRefunded,
    repaired,
    refundRetryPending,
    providerReconciliationPending,
    providerTtsResubmitted,
    providerTtsTerminalized,
    providerSubmissionReviewRequired,
    expiredRequests: expiredRequestCount,
    reconciledRequests: reconciledRequestCount,
    succeededRequests: succeededRequestCount,
    partialRequests: partialRequestCount,
    failedRequests: failedRequestCount,
    requestReconciliationPending,
    scanTruncated: {
      jobs: stuckJobsScanTruncated,
      reservations: reservationScanTruncated,
      requests: requestScanTruncated,
    },
    timestamp: new Date().toISOString(),
  });
}
