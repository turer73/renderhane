import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reserveCredits: vi.fn(),
  refundCredits: vi.fn(),
  subscribe: vi.fn(),
  createAdminClient: vi.fn(),
  completeJobOutputAndSpend: vi.fn(),
  failJobAndRefund: vi.fn(),
  uploadToR2: vi.fn(),
  jobUpdates: [] as Record<string, unknown>[],
  jobUpdateQueries: [] as Array<{
    payload: Record<string, unknown>;
    filters: Array<{ method: string; args: unknown[] }>;
  }>,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/credits/engine", () => ({
  reserveCredits: mocks.reserveCredits,
  refundCredits: mocks.refundCredits,
}));

vi.mock("@/lib/ai", () => ({
  getAIProvider: () => ({ subscribe: mocks.subscribe }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/auth/admin-check", () => ({
  isAdmin: () => false,
}));

vi.mock("@/lib/fal/smart-router", () => ({
  routeRequest: () => ({
    model: {
      id: "fal-ai/test-scene",
      creditCost: 8,
      displayName: { en: "Test Scene" },
    },
    input: { prompt: "studio scene" },
  }),
}));

vi.mock("@/lib/jobs/webhook-transitions", () => ({
  completeJobOutputAndSpend: mocks.completeJobOutputAndSpend,
  failJobAndRefund: mocks.failJobAndRefund,
}));

vi.mock("@/lib/r2/upload", () => ({
  uploadToR2: mocks.uploadToR2,
}));

import { submitJobSync } from "../submit-sync";

function createSupabaseMock(options?: {
  noRowForUpdate?: (payload: Record<string, unknown>, index: number) => boolean;
}) {
  const jobSingle = vi.fn().mockResolvedValue({
    data: { id: "job-sync-1" },
    error: null,
  });
  const from = vi.fn((table: string) => {
    if (table !== "jobs" && table !== "outputs") {
      throw new Error(`Unexpected table access: ${table}`);
    }
    return {
      insert: vi.fn(() => ({
        select: vi.fn(() => ({ single: jobSingle })),
      })),
      update: vi.fn((payload: Record<string, unknown>) => {
        const updateIndex = mocks.jobUpdates.push(payload) - 1;
        const query = {
          payload,
          filters: [] as Array<{ method: string; args: unknown[] }>,
        };
        mocks.jobUpdateQueries.push(query);
        const result = {
          data: options?.noRowForUpdate?.(payload, updateIndex)
            ? null
            : { id: "job-sync-1" },
          error: null,
        };
        const chain: Record<string, unknown> & PromiseLike<typeof result> = {
          then: (onFulfilled, onRejected) =>
            Promise.resolve(result).then(onFulfilled, onRejected),
        };
        for (const method of ["eq", "is", "in", "contains", "select"]) {
          chain[method] = vi.fn((...args: unknown[]) => {
            query.filters.push({ method, args });
            return chain;
          });
        }
        chain.maybeSingle = vi.fn().mockResolvedValue(result);
        return chain;
      }),
    };
  });

  return {
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({
          data: { user: { email: "user@example.com" } },
        }),
      },
    },
    rpc: vi.fn(),
    from,
  };
}

const successfulCompletion = {
  disposition: "completed" as const,
  outputId: "output-sync-1",
  userId: "user-1",
  projectId: null,
  outputType: "image" as const,
  r2Url: "https://assets.example/output-sync-1.png",
};

describe("submitJobSync atomic terminal transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobUpdates.length = 0;
    mocks.jobUpdateQueries.length = 0;
    mocks.createAdminClient.mockReturnValue(createSupabaseMock());
    mocks.reserveCredits.mockResolvedValue("tx-sync-1");
    mocks.refundCredits.mockResolvedValue(undefined);
    process.env.FAL_WEBHOOK_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
    mocks.subscribe.mockImplementation(async (endpointId, _input, options) => {
      const requestId = endpointId === "fal-ai/f5-tts" ? "fal-tts-1" : "fal-main-1";
      await options?.onEnqueue?.(requestId);
      return {
        requestId,
        data: { image: { url: "https://fal.media/result.png" } },
      };
    });
    mocks.completeJobOutputAndSpend.mockResolvedValue(successfulCompletion);
    mocks.failJobAndRefund.mockResolvedValue("failed_refunded");
  });

  it("commits output, job status and spend through the atomic success RPC", async () => {
    await expect(
      submitJobSync({ userId: "user-1", tool: "scene", prompt: "studio" })
    ).resolves.toEqual({
      jobId: "job-sync-1",
      creditCost: 8,
      status: "completed",
      output: { url: "https://assets.example/output-sync-1.png" },
    });

    expect(mocks.completeJobOutputAndSpend).toHaveBeenCalledWith({
      jobId: "job-sync-1",
      falUrl: "https://fal.media/result.png",
      metadata: { image: { url: "https://fal.media/result.png" } },
    });
    expect(mocks.failJobAndRefund).not.toHaveBeenCalled();
    expect(mocks.refundCredits).not.toHaveBeenCalled();
    expect(mocks.uploadToR2).not.toHaveBeenCalled();
    const acceptanceUpdates = mocks.jobUpdates.filter(
      (update) => update.fal_request_id === "fal-main-1"
    );
    expect(acceptanceUpdates).toHaveLength(1);
    expect(acceptanceUpdates[0]).not.toHaveProperty("status");
    const acceptanceQuery = mocks.jobUpdateQueries.find(
      (query) => query.payload === acceptanceUpdates[0]
    );
    expect(acceptanceQuery?.filters).toEqual(
      expect.arrayContaining([
        { method: "is", args: ["fal_request_id", null] },
        {
          method: "contains",
          args: [
            "original_request",
            {
              providerReconciliation: {
                stage: "main",
                endpointId: "fal-ai/test-scene",
                state: "submission_attempted",
              },
            },
          ],
        },
      ])
    );
    const mainAttempt = mocks.jobUpdates.find((update) => {
      const request = update.original_request as
        | { providerReconciliation?: { stage?: string; state?: string } }
        | undefined;
      return (
        request?.providerReconciliation?.stage === "main" &&
        request.providerReconciliation.state === "submission_attempted"
      );
    });
    expect(mainAttempt).toMatchObject({
      input_params: { prompt: "studio scene" },
      status: "processing",
    });
  });

  it("atomically fails and refunds when an accepted provider result has no output", async () => {
    mocks.subscribe.mockImplementation(async (_endpointId, _input, options) => {
      await options?.onEnqueue?.("fal-main-empty");
      return { requestId: "fal-main-empty", data: {} };
    });

    await expect(
      submitJobSync({ userId: "user-1", tool: "scene", prompt: "studio" })
    ).resolves.toEqual({
      jobId: "job-sync-1",
      requestId: "fal-main-empty",
      creditCost: 0,
      status: "failed",
      error: "Provider completed without a usable output",
    });

    expect(mocks.completeJobOutputAndSpend).not.toHaveBeenCalled();
    expect(mocks.failJobAndRefund).toHaveBeenCalledWith({
      jobId: "job-sync-1",
      errorMessage: "Provider completed without a usable output",
    });
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it("reports completed when the no-output failure RPC repairs a durable output", async () => {
    mocks.subscribe.mockImplementation(async (_endpointId, _input, options) => {
      await options?.onEnqueue?.("fal-main-repaired");
      return { requestId: "fal-main-repaired", data: {} };
    });
    mocks.failJobAndRefund.mockResolvedValueOnce("output_repaired");

    await expect(
      submitJobSync({ userId: "user-1", tool: "scene", prompt: "studio" })
    ).resolves.toEqual({
      jobId: "job-sync-1",
      requestId: "fal-main-repaired",
      creditCost: 8,
      status: "completed",
      output: null,
    });
  });

  it("keeps no-output state indeterminate when the failure RPC sees an output conflict", async () => {
    mocks.subscribe.mockImplementation(async (_endpointId, _input, options) => {
      await options?.onEnqueue?.("fal-main-output-present");
      return { requestId: "fal-main-output-present", data: {} };
    });
    mocks.failJobAndRefund.mockResolvedValueOnce("output_present");

    await expect(
      submitJobSync({ userId: "user-1", tool: "scene", prompt: "studio" })
    ).resolves.toMatchObject({
      jobId: "job-sync-1",
      requestId: "fal-main-output-present",
      creditCost: 8,
      status: "processing",
      submissionState: "indeterminate",
    });
  });

  it.each([
    new TypeError("fetch failed"),
    { status: 503, message: "provider unavailable" },
  ])("retains the job and reservation for an indeterminate subscribe error", async (error) => {
    mocks.subscribe.mockRejectedValue(error);

    await expect(
      submitJobSync({ userId: "user-1", tool: "scene", prompt: "studio" })
    ).resolves.toMatchObject({
      jobId: "job-sync-1",
      creditCost: 8,
      status: "processing",
      submissionState: "indeterminate",
    });

    expect(mocks.failJobAndRefund).not.toHaveBeenCalled();
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it("creates a durable talking-avatar job before an indeterminate TTS poll", async () => {
    mocks.subscribe.mockImplementationOnce(async (_endpointId, _input, options) => {
      await options?.onEnqueue?.("fal-tts-timeout");
      throw Object.assign(new TypeError("TTS poll timed out"), {
        requestId: "fal-tts-timeout",
      });
    });

    await expect(
      submitJobSync({
        userId: "user-1",
        tool: "talking-avatar",
        imageUrl: "https://cdn.example/avatar.png",
        script: "Merhaba",
      })
    ).resolves.toMatchObject({
      jobId: "job-sync-1",
      creditCost: 8,
      status: "processing",
      submissionState: "indeterminate",
      requestId: "fal-tts-timeout",
    });

    expect(mocks.failJobAndRefund).not.toHaveBeenCalled();
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it("does not let a stale TTS handler overwrite an already-advanced main marker", async () => {
    mocks.createAdminClient.mockReturnValue(
      createSupabaseMock({
        noRowForUpdate: (payload) => {
          const request = payload.original_request as
            | { providerReconciliation?: { stage?: string; state?: string } }
            | undefined;
          return (
            request?.providerReconciliation?.stage === "main" &&
            request.providerReconciliation.state === "submission_attempted"
          );
        },
      })
    );
    mocks.subscribe.mockImplementationOnce(
      async (_endpointId, _input, options) => {
        await options?.onEnqueue?.("fal-tts-cancel-race");
        return {
          requestId: "fal-tts-cancel-race",
          data: { audio_url: { url: "https://fal.media/voice.wav" } },
        };
      }
    );
    await expect(
      submitJobSync({
        userId: "user-1",
        tool: "talking-avatar",
        imageUrl: "https://cdn.example/avatar.png",
        script: "Merhaba",
      })
    ).resolves.toMatchObject({
      jobId: "job-sync-1",
      creditCost: 8,
      status: "processing",
      submissionState: "indeterminate",
    });

    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    expect(mocks.completeJobOutputAndSpend).not.toHaveBeenCalled();
    expect(mocks.failJobAndRefund).not.toHaveBeenCalled();
    const mainAttemptQuery = mocks.jobUpdateQueries.find((query) => {
      const request = query.payload.original_request as
        | { providerReconciliation?: { stage?: string; state?: string } }
        | undefined;
      return (
        request?.providerReconciliation?.stage === "main" &&
        request.providerReconciliation.state === "submission_attempted"
      );
    });
    expect(mainAttemptQuery?.filters).toEqual(
      expect.arrayContaining([
        {
          method: "eq",
          args: ["fal_request_id", "fal-tts-cancel-race"],
        },
        {
          method: "contains",
          args: [
            "original_request",
            {
              providerReconciliation: {
                stage: "tts",
                endpointId: "fal-ai/f5-tts",
                state: "accepted",
                requestId: "fal-tts-cancel-race",
              },
            },
          ],
        },
      ])
    );
  });

  it("does not refund a post-enqueue 422 returned while polling", async () => {
    mocks.subscribe.mockImplementationOnce(async (_endpointId, _input, options) => {
      await options?.onEnqueue?.("fal-main-accepted");
      throw { status: 422, requestId: "fal-main-accepted", message: "poll failed" };
    });

    await expect(
      submitJobSync({ userId: "user-1", tool: "scene", prompt: "studio" })
    ).resolves.toMatchObject({
      jobId: "job-sync-1",
      requestId: "fal-main-accepted",
      status: "processing",
      submissionState: "indeterminate",
    });

    expect(mocks.failJobAndRefund).not.toHaveBeenCalled();
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it("atomically fails and refunds a definitive subscribe rejection", async () => {
    mocks.subscribe.mockRejectedValue({ status: 422, message: "invalid input" });

    await expect(
      submitJobSync({ userId: "user-1", tool: "scene", prompt: "studio" })
    ).resolves.toMatchObject({
      jobId: "job-sync-1",
      creditCost: 0,
      status: "failed",
    });

    expect(mocks.failJobAndRefund).toHaveBeenCalledWith({
      jobId: "job-sync-1",
      errorMessage: "Processing failed",
    });
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it("reports committed success when the completion response is lost", async () => {
    mocks.completeJobOutputAndSpend.mockRejectedValue(
      new Error("completion transport lost")
    );
    mocks.failJobAndRefund.mockResolvedValue("already_completed");

    await expect(
      submitJobSync({ userId: "user-1", tool: "scene", prompt: "studio" })
    ).resolves.toEqual({
      jobId: "job-sync-1",
      creditCost: 8,
      status: "completed",
      output: { url: "https://fal.media/result.png" },
    });

    expect(mocks.failJobAndRefund).toHaveBeenCalledWith({
      jobId: "job-sync-1",
      errorMessage: "completion transport lost",
    });
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it.each(["terminal_conflict", "payload_conflict"] as const)(
    "does not overwrite a database-declined %s transition",
    async (disposition) => {
      mocks.completeJobOutputAndSpend.mockResolvedValue({
        ...successfulCompletion,
        disposition,
      });

      await expect(
        submitJobSync({ userId: "user-1", tool: "scene", prompt: "studio" })
      ).resolves.toEqual({
        jobId: "job-sync-1",
        creditCost: 0,
        status: "failed",
        error: `Atomic completion declined: ${disposition}`,
      });

      expect(mocks.failJobAndRefund).not.toHaveBeenCalled();
      expect(mocks.refundCredits).not.toHaveBeenCalled();
    }
  );

  it("propagates a failure RPC error instead of claiming a refund", async () => {
    mocks.subscribe.mockRejectedValue({ status: 422, message: "invalid input" });
    mocks.failJobAndRefund.mockRejectedValue(new Error("refund transaction failed"));

    await expect(
      submitJobSync({ userId: "user-1", tool: "scene", prompt: "studio" })
    ).rejects.toThrow("refund transaction failed");

    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });
});
