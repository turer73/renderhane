import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  refundCredits: vi.fn(),
  failJobAndRefund: vi.fn(),
  cancelJobAndRefund: vi.fn(),
  completeSocialKitRequest: vi.fn(),
  reconcileTalkingAvatarTts: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/credits/engine", () => ({
  refundCredits: mocks.refundCredits,
}));
vi.mock("@/lib/jobs/webhook-transitions", () => ({
  failJobAndRefund: mocks.failJobAndRefund,
  cancelJobAndRefund: mocks.cancelJobAndRefund,
}));
vi.mock("@/lib/jobs/social-kit-idempotency", () => ({
  completeSocialKitRequest: mocks.completeSocialKitRequest,
}));
vi.mock("@/lib/jobs/talking-avatar-reconciliation", () => ({
  reconcileTalkingAvatarTts: mocks.reconcileTalkingAvatarTts,
}));

import { GET } from "../route";

type QueryResult = { data: unknown; error: { message: string } | null };

function listChain(result: QueryResult) {
  const chain = {
    __kind: "scan" as "scan" | "direct",
    __result: result,
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    contains: vi.fn(),
    or: vi.fn(),
    lt: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.contains.mockReturnValue(chain);
  chain.or.mockReturnValue(chain);
  chain.lt.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockResolvedValue(result);
  return chain;
}

function directInChain(result: QueryResult) {
  const chain = listChain(result);
  chain.__kind = "direct";
  chain.in.mockResolvedValue(result);
  return chain;
}

function directContainsChain(result: QueryResult) {
  const chain = listChain(result);
  chain.__kind = "direct";
  chain.contains.mockResolvedValue(result);
  return chain;
}

function installAdmin(input: {
  jobs: unknown[];
  creditTransactions: unknown[];
  socialKitRequests: unknown[];
  outputs?: unknown[];
}) {
  const queues: Record<string, unknown[]> = {
    jobs: [...input.jobs],
    credit_transactions: [...input.creditTransactions],
    social_kit_requests: [...input.socialKitRequests],
    outputs: [...(input.outputs ?? [])],
  };

  const takeScanResults = (table: string) => {
    const results: QueryResult[] = [];
    while (
      queues[table]?.length > 0 &&
      (queues[table][0] as { __kind?: unknown }).__kind === "scan"
    ) {
      const chain = queues[table].shift() as { __result: QueryResult };
      results.push(chain.__result);
    }
    return results;
  };

  const scanQueues: Record<string, QueryResult[]> = {
    stuck_jobs: takeScanResults("jobs"),
    reserved_transactions: takeScanResults("credit_transactions"),
    social_kit_requests: takeScanResults("social_kit_requests"),
  };

  mocks.createAdminClient.mockReturnValue({
    rpc: vi.fn(
      async (
        functionName: string,
        args: { p_scan_name?: string }
      ): Promise<QueryResult> => {
        if (functionName !== "take_maintenance_scan_page") {
          throw new Error(`Unexpected RPC ${functionName}`);
        }
        const scanName = args.p_scan_name ?? "";
        const pages = scanQueues[scanName];
        if (!pages) throw new Error(`Unexpected scan ${scanName}`);
        const next = pages.shift() ?? { data: [], error: null };
        if (next.error) return { data: null, error: next.error };
        const cycleComplete = pages.length === 0;
        return {
          data: {
            rows: next.data ?? [],
            cycleComplete,
            scanTruncated: !cycleComplete,
          },
          error: null,
        };
      }
    ),
    from: vi.fn((table: string) => {
      const next = queues[table]?.shift();
      if (!next) throw new Error(`Unexpected ${table} query`);
      return next;
    }),
  });
}

function durableOutput(job: {
  id: string;
  user_id: string;
  project_id: string | null;
  tool: string;
}) {
  return {
    id: `output-${job.id}`,
    job_id: job.id,
    user_id: job.user_id,
    project_id: job.project_id,
    type: job.tool === "video" ? "video" : "image",
    fal_url: `https://fal.example/${job.id}`,
    r2_url: null,
  };
}

function validReservation(id: string) {
  return { id, user_id: "user-1", type: "spend", amount: -8 };
}

function cronRequest() {
  return new NextRequest("https://renderhane.com/api/cron/stuck-jobs", {
    headers: { authorization: "Bearer cron-secret" },
  });
}

describe("stuck-jobs atomic cleanup", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-secret";
    mocks.refundCredits.mockResolvedValue(undefined);
    mocks.failJobAndRefund.mockResolvedValue("failed_refunded");
    mocks.cancelJobAndRefund.mockResolvedValue("cancelled_refunded");
    mocks.completeSocialKitRequest.mockResolvedValue(undefined);
    mocks.reconcileTalkingAvatarTts.mockResolvedValue("provider_pending");
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("refunds only old reservations that have no linked job", async () => {
    const linkedJobs = directInChain({
      data: [{ id: "job-linked", credit_tx_id: "tx-linked", status: "processing" }],
      error: null,
    });
    installAdmin({
      jobs: [listChain({ data: [], error: null }), linkedJobs],
      creditTransactions: [
        listChain({
          data: [validReservation("tx-orphan"), validReservation("tx-linked")],
          error: null,
        }),
      ],
      socialKitRequests: [listChain({ data: [], error: null })],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({
      cleaned: 0,
      orphanRefunded: 1,
    });
    expect(mocks.refundCredits).toHaveBeenCalledOnce();
    expect(mocks.refundCredits).toHaveBeenCalledWith("tx-orphan");
  });

  it("fails closed instead of refunding malformed orphan reservations", async () => {
    installAdmin({
      jobs: [listChain({ data: [], error: null })],
      creditTransactions: [
        listChain({
          data: [
            { id: "tx-purchase", user_id: "user-1", type: "purchase", amount: -8 },
            { id: "tx-positive", user_id: "user-1", type: "spend", amount: 8 },
            { id: "tx-zero", user_id: "user-1", type: "spend", amount: 0 },
            { id: "tx-no-user", user_id: null, type: "spend", amount: -8 },
          ],
          error: null,
        }),
      ],
      socialKitRequests: [listChain({ data: [], error: null })],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({
      orphanRefunded: 0,
      orphanValidationPending: 4,
    });
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it("fails closed when reservation linkage cannot be verified", async () => {
    installAdmin({
      jobs: [
        listChain({ data: [], error: null }),
        directInChain({ data: null, error: { message: "database unavailable" } }),
      ],
      creditTransactions: [
        listChain({ data: [validReservation("tx-unknown")], error: null }),
      ],
      socialKitRequests: [listChain({ data: [], error: null })],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({ orphanRefunded: 0 });
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it("keeps a stuck job retryable when its atomic transition fails", async () => {
    mocks.failJobAndRefund.mockRejectedValueOnce(new Error("database unavailable"));
    installAdmin({
      jobs: [listChain({ data: [{ id: "job-retry" }], error: null })],
      creditTransactions: [listChain({ data: [], error: null })],
      socialKitRequests: [listChain({ data: [], error: null })],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({
      cleaned: 0,
      refunded: 0,
      refundRetryPending: 1,
    });
    expect(mocks.failJobAndRefund).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-retry", staleBefore: expect.any(String) })
    );
  });

  it("never blindly refunds a stale job with a provider submission reference", async () => {
    installAdmin({
      jobs: [
        listChain({
          data: [
            {
              id: "job-provider-pending",
              fal_request_id: "fal-request-1",
              original_request: {
                providerReconciliation: {
                  stage: "main",
                  endpointId: "fal-ai/test",
                  state: "accepted",
                  requestId: "fal-request-1",
                },
              },
            },
            {
              id: "job-provider-ambiguous",
              fal_request_id: null,
              original_request: {
                providerReconciliation: {
                  stage: "tts",
                  endpointId: "fal-ai/f5-tts",
                  state: "submission_attempted",
                },
              },
            },
          ],
          error: null,
        }),
      ],
      creditTransactions: [listChain({ data: [], error: null })],
      socialKitRequests: [listChain({ data: [], error: null })],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({
      cleaned: 0,
      refunded: 0,
      providerReconciliationPending: 2,
    });
    expect(mocks.failJobAndRefund).not.toHaveBeenCalled();
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it("escalates an old unacknowledged provider attempt without refunding it", async () => {
    installAdmin({
      jobs: [
        listChain({
          data: [
            {
              id: "job-provider-attempt-expired",
              fal_request_id: null,
              original_request: {
                tool: "scene",
                providerReconciliation: {
                  stage: "main",
                  endpointId: "fal-ai/test",
                  state: "submission_attempted",
                  updatedAt: "2020-01-01T00:00:00.000Z",
                },
              },
            },
          ],
          error: null,
        }),
      ],
      creditTransactions: [listChain({ data: [], error: null })],
      socialKitRequests: [listChain({ data: [], error: null })],
    });

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await GET(cronRequest());

    await expect(response.json()).resolves.toMatchObject({
      providerSubmissionReviewRequired: 1,
      providerReconciliationPending: 1,
    });
    expect(mocks.failJobAndRefund).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      "[stuck-jobs] Provider submission outcome requires manual review for job-provider-attempt-expired"
    );
    error.mockRestore();
  });

  it("resumes a durable accepted TTS stage instead of refunding it", async () => {
    mocks.reconcileTalkingAvatarTts.mockResolvedValueOnce("main_resubmitted");
    const ttsJob = {
      id: "job-tts-resume",
      user_id: "user-1",
      model_id: "fal-ai/bytedance/omnihuman/v1.5",
      status: "processing",
      credit_tx_id: "tx-avatar",
      fal_request_id: "fal-tts-1",
      original_request: {
        tool: "talking-avatar",
        imageUrl: "https://cdn.example/avatar.png",
        script: "Merhaba",
        providerReconciliation: {
          stage: "tts",
          endpointId: "fal-ai/f5-tts",
          state: "accepted",
          requestId: "fal-tts-1",
        },
      },
    };
    installAdmin({
      jobs: [listChain({ data: [ttsJob], error: null })],
      creditTransactions: [listChain({ data: [], error: null })],
      socialKitRequests: [listChain({ data: [], error: null })],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({
      providerTtsResubmitted: 1,
      providerReconciliationPending: 0,
      refunded: 0,
    });
    expect(mocks.reconcileTalkingAvatarTts).toHaveBeenCalledWith(ttsJob);
    expect(mocks.failJobAndRefund).not.toHaveBeenCalled();
  });

  it("scans past fifty provider-pending jobs to clean a later eligible job", async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({
      id: `job-provider-${String(index).padStart(2, "0")}`,
      user_id: "user-1",
      model_id: "fal-ai/test",
      status: "processing",
      credit_tx_id: `tx-provider-${index}`,
      fal_request_id: `fal-provider-${index}`,
      original_request: {
        providerReconciliation: {
          stage: "main",
          state: "accepted",
          requestId: `fal-provider-${index}`,
        },
      },
      created_at: `2026-01-01T00:00:${String(index).padStart(2, "0")}.000Z`,
    }));
    const eligible = {
      id: "job-clean-after-provider-page",
      user_id: "user-1",
      model_id: "fal-ai/test",
      status: "processing",
      credit_tx_id: "tx-clean",
      fal_request_id: null,
      original_request: { tool: "scene" },
      created_at: "2026-01-01T00:01:00.000Z",
    };
    installAdmin({
      jobs: [
        listChain({ data: firstPage, error: null }),
        listChain({ data: [eligible], error: null }),
      ],
      creditTransactions: [listChain({ data: [], error: null })],
      socialKitRequests: [listChain({ data: [], error: null })],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({
      cleaned: 1,
      providerReconciliationPending: 50,
      scanTruncated: { jobs: false },
    });
    expect(mocks.failJobAndRefund).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: eligible.id })
    );
  });

  it("continues after five hundred permanent head rows on the next cron run", async () => {
    const pages = Array.from({ length: 10 }, (_, pageIndex) =>
      listChain({
        data: Array.from({ length: 50 }, (_, rowIndex) => ({
          id: `job-provider-${pageIndex}-${rowIndex}`,
          fal_request_id: `fal-provider-${pageIndex}-${rowIndex}`,
          original_request: {
            providerReconciliation: {
              stage: "main",
              state: "accepted",
              requestId: `fal-provider-${pageIndex}-${rowIndex}`,
            },
          },
        })),
        error: null,
      })
    );
    pages.push(
      listChain({
        data: [
          {
            id: "job-after-persisted-cursor",
            fal_request_id: null,
            original_request: { tool: "scene" },
          },
        ],
        error: null,
      })
    );
    installAdmin({
      jobs: pages,
      creditTransactions: [listChain({ data: [], error: null })],
      socialKitRequests: [listChain({ data: [], error: null })],
    });

    const firstResponse = await GET(cronRequest());
    await expect(firstResponse.json()).resolves.toMatchObject({
      providerReconciliationPending: 500,
      scanTruncated: { jobs: true },
    });

    const secondResponse = await GET(cronRequest());
    await expect(secondResponse.json()).resolves.toMatchObject({
      cleaned: 1,
      scanTruncated: { jobs: false },
    });
    expect(mocks.failJobAndRefund).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-after-persisted-cursor" })
    );
  });

  it("scans past fifty linked reservations to refund a later orphan", async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({
      ...validReservation(`tx-linked-${String(index).padStart(2, "0")}`),
      created_at: `2026-01-01T00:00:${String(index).padStart(2, "0")}.000Z`,
    }));
    const orphan = {
      ...validReservation("tx-late-orphan"),
      created_at: "2026-01-01T00:01:00.000Z",
    };
    installAdmin({
      jobs: [
        listChain({ data: [], error: null }),
        directInChain({
          data: firstPage.map((transaction) => ({
            id: `job-${transaction.id}`,
            credit_tx_id: transaction.id,
            status: "processing",
          })),
          error: null,
        }),
        directInChain({ data: [], error: null }),
      ],
      creditTransactions: [
        listChain({ data: firstPage, error: null }),
        listChain({ data: [orphan], error: null }),
      ],
      socialKitRequests: [listChain({ data: [], error: null })],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({
      orphanRefunded: 1,
      scanTruncated: { reservations: false },
    });
    expect(mocks.refundCredits).toHaveBeenCalledOnce();
    expect(mocks.refundCredits).toHaveBeenCalledWith(orphan.id);
  });

  it("scans past fifty malformed requests to finalize a later request", async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({
      id: `request-malformed-${String(index).padStart(2, "0")}`,
      user_id: "user-1",
      reservation_ids: null,
      created_at: `2026-01-01T00:00:${String(index).padStart(2, "0")}.000Z`,
    }));
    const finalizable = {
      id: "request-finalizable-after-page",
      user_id: "user-1",
      reservation_ids: [],
      created_at: "2026-01-01T00:01:00.000Z",
    };
    installAdmin({
      jobs: [
        listChain({ data: [], error: null }),
        directContainsChain({ data: [], error: null }),
      ],
      creditTransactions: [listChain({ data: [], error: null })],
      socialKitRequests: [
        listChain({ data: firstPage, error: null }),
        listChain({ data: [finalizable], error: null }),
      ],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({
      reconciledRequests: 1,
      requestReconciliationPending: 50,
      scanTruncated: { requests: false },
    });
    expect(mocks.completeSocialKitRequest).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: finalizable.id })
    );
  });

  it("counts a job only after the atomic failure/refund RPC commits", async () => {
    installAdmin({
      jobs: [listChain({ data: [{ id: "job-recovered" }], error: null })],
      creditTransactions: [listChain({ data: [], error: null })],
      socialKitRequests: [listChain({ data: [], error: null })],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({
      cleaned: 1,
      refunded: 1,
      refundRetryPending: 0,
    });
  });

  it("counts a legacy durable output repaired by the atomic transition", async () => {
    mocks.failJobAndRefund.mockResolvedValueOnce("output_repaired");
    installAdmin({
      jobs: [listChain({ data: [{ id: "job-with-output" }], error: null })],
      creditTransactions: [listChain({ data: [], error: null })],
      socialKitRequests: [listChain({ data: [], error: null })],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({
      cleaned: 0,
      refunded: 0,
      repaired: 1,
    });
  });

  it("reconciles legacy failed reservations but leaves completed links untouched", async () => {
    installAdmin({
      jobs: [
        listChain({ data: [], error: null }),
        directInChain({
          data: [
            { id: "job-failed", credit_tx_id: "tx-failed", status: "failed" },
            {
              id: "job-completed",
              credit_tx_id: "tx-completed",
              status: "completed",
            },
          ],
          error: null,
        }),
      ],
      creditTransactions: [
        listChain({
          data: [validReservation("tx-failed"), validReservation("tx-completed")],
          error: null,
        }),
      ],
      socialKitRequests: [listChain({ data: [], error: null })],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({ terminalRefunded: 1 });
    expect(mocks.refundCredits).not.toHaveBeenCalled();
    expect(mocks.failJobAndRefund).toHaveBeenCalledWith({
      jobId: "job-failed",
      errorMessage: "Failed job credit reconciliation",
    });
  });

  it("repairs a legacy cancelled job through the atomic cancellation RPC", async () => {
    installAdmin({
      jobs: [
        listChain({ data: [], error: null }),
        directInChain({
          data: [
            {
              id: "job-cancelled",
              credit_tx_id: "tx-cancelled",
              status: "cancelled",
            },
          ],
          error: null,
        }),
      ],
      creditTransactions: [
        listChain({ data: [validReservation("tx-cancelled")], error: null }),
      ],
      socialKitRequests: [listChain({ data: [], error: null })],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({ terminalRefunded: 1 });
    expect(mocks.refundCredits).not.toHaveBeenCalled();
    expect(mocks.cancelJobAndRefund).toHaveBeenCalledWith({
      jobId: "job-cancelled",
      reason: "Legacy cancelled job credit reconciliation",
      expectedProviderRequestId: null,
    });
  });

  it("finalizes a stale claim that never reserved or created provider jobs", async () => {
    installAdmin({
      jobs: [
        listChain({ data: [], error: null }),
        directContainsChain({ data: [], error: null }),
      ],
      creditTransactions: [listChain({ data: [], error: null })],
      socialKitRequests: [
        listChain({
          data: [
            { id: "request-empty", user_id: "user-1", reservation_ids: [] },
          ],
          error: null,
        }),
      ],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({
      expiredRequests: 1,
      reconciledRequests: 1,
      failedRequests: 1,
      requestReconciliationPending: 0,
    });
    expect(mocks.completeSocialKitRequest).toHaveBeenCalledWith({
      requestId: "request-empty",
      userId: "user-1",
      responseStatus: 500,
      responseHeaders: {},
      responseBody: expect.objectContaining({
        outcome: "failed",
        error: "social_kit_generation_failed",
        completedJobs: 0,
        failedJobs: 5,
        idempotency: { outcome: "final", keyAction: "rotate" },
      }),
    });
  });

  it("keeps a stale request processing while a provider job is non-terminal", async () => {
    const reservationIds = ["tx-1", "tx-2", "tx-3", "tx-4", "tx-5"];
    installAdmin({
      jobs: [
        listChain({ data: [], error: null }),
        directInChain({
          data: [
            {
              id: "job-active",
              user_id: "user-1",
              project_id: "project-1",
              credit_cost: 8,
              credit_tx_id: "tx-1",
              status: "processing",
              tool: "scene",
              error_message: null,
            },
          ],
          error: null,
        }),
      ],
      creditTransactions: [
        listChain({ data: [], error: null }),
        directInChain({
          data: reservationIds.map((id) => ({
            id,
            user_id: "user-1",
            type: "spend",
            status: id === "tx-1" ? "reserved" : "refunded",
            amount: id === "tx-5" ? -35 : -8,
            job_id: null,
          })),
          error: null,
        }),
      ],
      socialKitRequests: [
        listChain({
          data: [
            {
              id: "request-active",
              user_id: "user-1",
              reservation_ids: reservationIds,
            },
          ],
          error: null,
        }),
      ],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({
      expiredRequests: 0,
      requestReconciliationPending: 1,
    });
    expect(mocks.completeSocialKitRequest).not.toHaveBeenCalled();
  });

  it("durably succeeds a paid request only when all five jobs and ledgers completed", async () => {
    const reservationIds = ["tx-1", "tx-2", "tx-3", "tx-4", "tx-5"];
    const completedJobs = reservationIds.map((transactionId, index) => ({
      id: `job-${index + 1}`,
      user_id: "user-1",
      project_id: "project-1",
      credit_cost: index === 4 ? 35 : 8,
      credit_tx_id: transactionId,
      status: "completed",
      tool: index === 4 ? "video" : "scene",
      error_message: null,
    }));
    installAdmin({
      jobs: [
        listChain({ data: [], error: null }),
        directInChain({ data: completedJobs, error: null }),
      ],
      creditTransactions: [
        listChain({ data: [], error: null }),
        directInChain({
          data: reservationIds.map((id, index) => ({
            id,
            user_id: "user-1",
            type: "spend",
            status: "completed",
            amount: index === 4 ? -35 : -8,
            job_id: `job-${index + 1}`,
          })),
          error: null,
        }),
      ],
      socialKitRequests: [
        listChain({
          data: [
            {
              id: "request-success",
              user_id: "user-1",
              reservation_ids: reservationIds,
            },
          ],
          error: null,
        }),
      ],
      outputs: [
        directInChain({ data: completedJobs.map(durableOutput), error: null }),
      ],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({
      expiredRequests: 0,
      reconciledRequests: 1,
      succeededRequests: 1,
      requestReconciliationPending: 0,
    });
    expect(mocks.completeSocialKitRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "request-success",
        userId: "user-1",
        responseStatus: 200,
        responseBody: expect.objectContaining({
          outcome: "succeeded",
          totalCost: 67,
          completedJobs: 5,
          sceneCount: 4,
          hasVideo: true,
          idempotency: { outcome: "final", keyAction: "rotate" },
        }),
      })
    );
  });

  it("durably completes a mixed terminal request as a partial package", async () => {
    const reservationIds = ["tx-1", "tx-2", "tx-3", "tx-4", "tx-5"];
    const partialJobs = [
      { id: "job-scene-1", user_id: "user-1", project_id: "project-1", credit_cost: 8, credit_tx_id: "tx-1", status: "completed", tool: "scene", error_message: null },
      { id: "job-scene-2", user_id: "user-1", project_id: "project-1", credit_cost: 8, credit_tx_id: "tx-2", status: "completed", tool: "scene", error_message: null },
      { id: "job-scene-failed", user_id: "user-1", project_id: "project-1", credit_cost: 8, credit_tx_id: "tx-3", status: "failed", tool: "scene", error_message: "provider rejected input" },
      { id: "job-video", user_id: "user-1", project_id: "project-1", credit_cost: 35, credit_tx_id: "tx-5", status: "completed", tool: "video", error_message: null },
    ];
    installAdmin({
      jobs: [
        listChain({ data: [], error: null }),
        directInChain({
          data: partialJobs,
          error: null,
        }),
      ],
      creditTransactions: [
        listChain({ data: [], error: null }),
        directInChain({
          data: [
            { id: "tx-1", user_id: "user-1", type: "spend", status: "completed", amount: -8, job_id: "job-scene-1" },
            { id: "tx-2", user_id: "user-1", type: "spend", status: "completed", amount: -8, job_id: "job-scene-2" },
            { id: "tx-3", user_id: "user-1", type: "spend", status: "refunded", amount: -8, job_id: "job-scene-failed" },
            { id: "tx-4", user_id: "user-1", type: "spend", status: "refunded", amount: -8, job_id: null },
            { id: "tx-5", user_id: "user-1", type: "spend", status: "completed", amount: -35, job_id: "job-video" },
          ],
          error: null,
        }),
      ],
      socialKitRequests: [
        listChain({
          data: [
            {
              id: "request-partial",
              user_id: "user-1",
              reservation_ids: reservationIds,
            },
          ],
          error: null,
        }),
      ],
      outputs: [
        directInChain({
          data: partialJobs
            .filter((job) => job.status === "completed")
            .map(durableOutput),
          error: null,
        }),
      ],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({
      reconciledRequests: 1,
      partialRequests: 1,
      requestReconciliationPending: 0,
    });
    expect(mocks.completeSocialKitRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        responseStatus: 200,
        responseBody: expect.objectContaining({
          outcome: "partial",
          totalCost: 51,
          completedJobs: 3,
          failedJobs: 2,
          sceneCount: 2,
          hasVideo: true,
          idempotency: { outcome: "final", keyAction: "rotate" },
        }),
      })
    );
  });

  it("durably fails a paid request after every reservation is refunded", async () => {
    const reservationIds = ["tx-1", "tx-2", "tx-3", "tx-4", "tx-5"];
    installAdmin({
      jobs: [
        listChain({ data: [], error: null }),
        directInChain({ data: [], error: null }),
      ],
      creditTransactions: [
        listChain({ data: [], error: null }),
        directInChain({
          data: reservationIds.map((id, index) => ({
            id,
            user_id: "user-1",
            type: "spend",
            status: "refunded",
            amount: index === 4 ? -35 : -8,
            job_id: null,
          })),
          error: null,
        }),
      ],
      socialKitRequests: [
        listChain({
          data: [
            {
              id: "request-failed",
              user_id: "user-1",
              reservation_ids: reservationIds,
            },
          ],
          error: null,
        }),
      ],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({
      reconciledRequests: 1,
      failedRequests: 1,
      expiredRequests: 1,
      requestReconciliationPending: 0,
    });
    expect(mocks.completeSocialKitRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        responseStatus: 500,
        responseBody: expect.objectContaining({
          outcome: "failed",
          error: "social_kit_generation_failed",
          totalCost: 0,
          completedJobs: 0,
          failedJobs: 5,
          idempotency: { outcome: "final", keyAction: "rotate" },
        }),
      })
    );
  });

  it.each([
    ["missing", []],
    [
      "malformed",
      [
        {
          id: "output-job-1",
          job_id: "job-1",
          user_id: "other-user",
          project_id: "project-1",
          type: "image",
          fal_url: null,
          r2_url: null,
        },
      ],
    ],
  ])("keeps a completed paid child pending with a %s output snapshot", async (_case, outputs) => {
    const reservationIds = ["tx-1", "tx-2", "tx-3", "tx-4", "tx-5"];
    installAdmin({
      jobs: [
        listChain({ data: [], error: null }),
        directInChain({
          data: [
            {
              id: "job-1",
              user_id: "user-1",
              project_id: "project-1",
              credit_cost: 8,
              credit_tx_id: "tx-1",
              status: "completed",
              tool: "scene",
              error_message: null,
            },
          ],
          error: null,
        }),
      ],
      creditTransactions: [
        listChain({ data: [], error: null }),
        directInChain({
          data: reservationIds.map((id) => ({
            id,
            user_id: "user-1",
            type: "spend",
            status: id === "tx-1" ? "completed" : "refunded",
            amount: -8,
            job_id: id === "tx-1" ? "job-1" : null,
          })),
          error: null,
        }),
      ],
      socialKitRequests: [
        listChain({
          data: [
            { id: "request-output-check", user_id: "user-1", reservation_ids: reservationIds },
          ],
          error: null,
        }),
      ],
      outputs: [directInChain({ data: outputs, error: null })],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({
      reconciledRequests: 0,
      requestReconciliationPending: 1,
    });
    expect(mocks.completeSocialKitRequest).not.toHaveBeenCalled();
  });

  it("reconciles terminal free/admin child jobs without credit reservations", async () => {
    const freeJobs = [
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `job-free-scene-${index + 1}`,
        user_id: "admin-1",
        project_id: null,
        credit_cost: 0,
        credit_tx_id: null,
        status: "completed",
        tool: "scene",
        error_message: null,
      })),
      {
        id: "job-free-video",
        user_id: "admin-1",
        project_id: null,
        credit_cost: 0,
        credit_tx_id: null,
        status: "completed",
        tool: "video",
        error_message: null,
      },
    ];
    installAdmin({
      jobs: [
        listChain({ data: [], error: null }),
        directContainsChain({
          data: freeJobs,
          error: null,
        }),
      ],
      creditTransactions: [listChain({ data: [], error: null })],
      socialKitRequests: [
        listChain({
          data: [
            { id: "request-free", user_id: "admin-1", reservation_ids: [] },
          ],
          error: null,
        }),
      ],
      outputs: [directInChain({ data: freeJobs.map(durableOutput), error: null })],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({
      reconciledRequests: 1,
      succeededRequests: 1,
      requestReconciliationPending: 0,
    });
    expect(mocks.completeSocialKitRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "admin-1",
        responseBody: expect.objectContaining({
          outcome: "succeeded",
          totalCost: 0,
        }),
      })
    );
  });

  it("keeps the request processing when durable finalization is not confirmed", async () => {
    mocks.completeSocialKitRequest.mockRejectedValueOnce(
      new Error("completion transport unavailable")
    );
    installAdmin({
      jobs: [
        listChain({ data: [], error: null }),
        directContainsChain({ data: [], error: null }),
      ],
      creditTransactions: [listChain({ data: [], error: null })],
      socialKitRequests: [
        listChain({
          data: [
            { id: "request-retry", user_id: "user-1", reservation_ids: [] },
          ],
          error: null,
        }),
      ],
    });

    const response = await GET(cronRequest());
    await expect(response.json()).resolves.toMatchObject({
      reconciledRequests: 0,
      requestReconciliationPending: 1,
    });
  });
});
