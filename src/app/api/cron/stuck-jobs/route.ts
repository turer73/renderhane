import "server-only";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { refundCredits } from "@/lib/credits/engine";
import { NextRequest, NextResponse } from "next/server";

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

  // Find stuck jobs: processing + started >15 min ago
  const { data: stuckJobs, error } = await supabase
    .from("jobs")
    .select("id, credit_tx_id, user_id, tool")
    .in("status", ["processing", "pending"])
    .lt("created_at", cutoff)
    .limit(50);

  let refunded = 0;
  let failed = 0;

  if (error) {
    console.error("[stuck-jobs] Failed to query stuck jobs:", error.message);
  }

  for (const job of stuckJobs ?? []) {
    try {
      // Refund credits if reserved
      if (job.credit_tx_id) {
        try {
          await refundCredits(job.credit_tx_id);
          refunded++;
        } catch {
          // May already be refunded — non-fatal
        }
      }

      // Mark job as failed
      await supabase
        .from("jobs")
        .update({
          status: "failed",
          error_message: "Processing timeout — credits refunded automatically",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      failed++;
    } catch (err) {
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
  const { data: oldReservations, error: reservationError } = await supabase
    .from("credit_transactions")
    .select("id")
    .eq("status", "reserved")
    .lt("created_at", cutoff)
    .limit(50);

  if (reservationError) {
    console.error(
      "[stuck-jobs] Failed to query orphan reservations:",
      reservationError.message
    );
  } else if (oldReservations && oldReservations.length > 0) {
    const reservationIds = oldReservations.map((transaction) => transaction.id);
    const { data: linkedJobs, error: linkedJobsError } = await supabase
      .from("jobs")
      .select("credit_tx_id")
      .in("credit_tx_id", reservationIds);

    if (linkedJobsError) {
      // Fail closed: never refund when linkage could not be verified.
      console.error(
        "[stuck-jobs] Failed to verify reservation links:",
        linkedJobsError.message
      );
    } else {
      const linkedTransactionIds = new Set(
        (linkedJobs ?? [])
          .map((job) => job.credit_tx_id)
          .filter((id): id is string => Boolean(id))
      );

      for (const transactionId of reservationIds) {
        if (linkedTransactionIds.has(transactionId)) continue;
        try {
          await refundCredits(transactionId);
          orphanRefunded++;
        } catch (refundError) {
          console.error(
            `[stuck-jobs] Failed to refund orphan reservation ${transactionId}:`,
            refundError
          );
        }
      }
    }
  }

  return NextResponse.json({
    cleaned: failed,
    refunded,
    orphanRefunded,
    timestamp: new Date().toISOString(),
  });
}
