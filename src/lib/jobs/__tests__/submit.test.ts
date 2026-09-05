import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODELS } from "@/lib/fal/models";

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  reserveCredits: vi.fn(),
  refundCredits: vi.fn(),
  subscribe: vi.fn(),
  submit: vi.fn(),
  createAdminClient: vi.fn(),
  failJobAndRefund: vi.fn(),
  jobUpdateEq: vi.fn(),
  jobUpdates: [] as Record<string, unknown>[],
  jobUpdateQueries: [] as Array<{
    payload: Record<string, unknown>;
    filters: Array<{ method: string; args: unknown[] }>;
  }>,
}));

vi.mock("@/lib/credits/engine", () => ({
  reserveCredits: mocks.reserveCredits,
  refundCredits: mocks.refundCredits,
}));

vi.mock("@/lib/ai", () => ({
  getAIProvider: () => ({
    subscribe: mocks.subscribe,
    submit: mocks.submit,
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/jobs/webhook-transitions", () => ({
  failJobAndRefund: mocks.failJobAndRefund,
}));

vi.mock("@/lib/auth/admin-check", () => ({
  isAdmin: () => false,
}));

vi.mock("@/lib/prompts/compose", () => ({
  composeSmartPrompt: vi.fn(),
}));

import { submitJob } from "../submit";

function createSupabaseMock() {
  const insertSingle = vi.fn().mockImplementation(async () => {
    mocks.events.push("job-insert");
    return {
      data: { id: "job-1" },
      error: null,
    };
  });
  const from = vi.fn(() => ({
    insert: vi.fn(() => ({
      select: vi.fn(() => ({ single: insertSingle })),
    })),
    update: vi.fn((payload: Record<string, unknown>) => {
      mocks.jobUpdates.push(payload);
      const query = {
        payload,
        filters: [] as Array<{ method: string; args: unknown[] }>,
      };
      mocks.jobUpdateQueries.push(query);
      const resolveResult = async () => {
        const result = await mocks.jobUpdateEq();
        return result?.error
          ? result
          : {
              data:
                result && Object.prototype.hasOwnProperty.call(result, "data")
                  ? result.data
                  : { id: "job-1" },
              error: null,
            };
      };
      const chain: Record<string, unknown> &
        PromiseLike<{ data?: { id: string }; error: unknown }> = {
        then: (onFulfilled, onRejected) =>
          resolveResult().then(onFulfilled, onRejected),
      };
      for (const method of ["eq", "is", "in", "contains", "select"]) {
        chain[method] = vi.fn((...args: unknown[]) => {
          query.filters.push({ method, args });
          return chain;
        });
      }
      chain.maybeSingle = vi.fn(resolveResult);
      return chain;
    }),
  }));

  return {
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({
          data: { user: { email: "user@example.com" } },
        }),
      },
    },
    rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    from,
  };
}

describe("submitJob credit ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.events.length = 0;
    mocks.jobUpdates.length = 0;
    mocks.jobUpdateQueries.length = 0;
    process.env.FAL_WEBHOOK_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com";

    mocks.createAdminClient.mockReturnValue(createSupabaseMock());
    mocks.jobUpdateEq.mockResolvedValue({ error: null });
    mocks.failJobAndRefund.mockImplementation(async () => {
      mocks.events.push("atomic-fail");
      return "failed_refunded";
    });
    mocks.reserveCredits.mockImplementation(async (_userId, amount) => {
      mocks.events.push(`reserve:${amount}`);
      return "tx-1";
    });
    mocks.refundCredits.mockImplementation(async () => {
      mocks.events.push("refund");
    });
    mocks.subscribe.mockImplementation(async (modelId, input, options) => {
      mocks.events.push(`subscribe:${modelId}`);
      const requestId = modelId === "fal-ai/f5-tts" ? "fal-tts-1" : "fal-preprocess-1";
      await options?.onEnqueue?.(requestId);
      return {
        requestId,
        data: { image: { url: `${input.image_url}?processed=1` } },
      };
    });
    mocks.submit.mockImplementation(async () => {
      mocks.events.push("submit");
      return { requestId: "fal-request-1" };
    });
  });

  it("reserves before paid 3D preprocessing and charges enhancement per image", async () => {
    const result = await submitJob({
      userId: "user-1",
      tool: "3d-model",
      imageUrls: ["https://cdn.example/a.png", "https://cdn.example/b.png"],
      autoEnhance: true,
    });

    const expectedCost = MODELS["hunyuan3d-v3"].creditCost + 2 * 4;
    expect(result.creditCost).toBe(expectedCost);
    expect(mocks.events.slice(0, 2)).toEqual([
      "job-insert",
      `reserve:${expectedCost}`,
    ]);
    expect(mocks.events.filter((event) => event.includes("birefnet"))).toHaveLength(2);
    expect(mocks.events.filter((event) => event.includes("aura-sr"))).toHaveLength(2);
    expect(mocks.events.at(-1)).toBe("submit");
  });

  it("atomically fails a talking-avatar TTS result with no audio output", async () => {
    mocks.subscribe.mockImplementationOnce(async (modelId) => {
      mocks.events.push(`subscribe:${modelId}`);
      return { data: {} };
    });

    await expect(
      submitJob({
        userId: "user-1",
        tool: "talking-avatar",
        imageUrl: "https://cdn.example/avatar.png",
        script: "Merhaba",
      })
    ).rejects.toThrow("TTS provider completed without an audio output");

    expect(mocks.events).toEqual([
      "job-insert",
      `reserve:${MODELS.omnihuman.creditCost}`,
      "subscribe:fal-ai/f5-tts",
      "atomic-fail",
    ]);
    expect(mocks.failJobAndRefund).toHaveBeenCalledWith({
      jobId: "job-1",
      errorMessage: "TTS provider completed without an audio output",
    });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("retains talking-avatar reservation when TTS polling is transport-indeterminate", async () => {
    mocks.subscribe.mockRejectedValueOnce(new TypeError("TTS poll timed out"));

    const result = await submitJob({
      userId: "user-1",
      tool: "talking-avatar",
      imageUrl: "https://cdn.example/avatar.png",
      script: "Merhaba",
    });

    expect(result).toMatchObject({
      jobId: "job-1",
      submissionState: "indeterminate",
      warning: "provider_submission_outcome_indeterminate",
    });
    expect(mocks.failJobAndRefund).not.toHaveBeenCalled();
    expect(mocks.refundCredits).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("retains a talking-avatar reservation when a post-enqueue poll returns 422", async () => {
    mocks.subscribe.mockImplementationOnce(async (_modelId, _input, options) => {
      await options?.onEnqueue?.("fal-tts-accepted");
      throw { status: 422, requestId: "fal-tts-accepted", message: "poll failed" };
    });

    const result = await submitJob({
      userId: "user-1",
      tool: "talking-avatar",
      imageUrl: "https://cdn.example/avatar.png",
      script: "Merhaba",
    });

    expect(result).toMatchObject({
      jobId: "job-1",
      requestId: "fal-tts-accepted",
      submissionState: "indeterminate",
    });
    expect(mocks.failJobAndRefund).not.toHaveBeenCalled();
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it("does not let a stale TTS handler overwrite an already-advanced main marker", async () => {
    mocks.subscribe.mockImplementationOnce(
      async (_modelId, _input, options) => {
        await options?.onEnqueue?.("fal-tts-cancel-race");
        return {
          requestId: "fal-tts-cancel-race",
          data: { audio_url: { url: "https://fal.media/voice.wav" } },
        };
      }
    );
    mocks.jobUpdateEq
      .mockResolvedValueOnce({ data: { id: "job-1" }, error: null })
      .mockResolvedValueOnce({ data: { id: "job-1" }, error: null })
      .mockResolvedValueOnce({ data: { id: "job-1" }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(
      submitJob({
        userId: "user-1",
        tool: "talking-avatar",
        imageUrl: "https://cdn.example/avatar.png",
        script: "Merhaba",
      })
    ).resolves.toMatchObject({
      jobId: "job-1",
      creditCost: MODELS.omnihuman.creditCost,
      submissionState: "indeterminate",
    });

    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.failJobAndRefund).not.toHaveBeenCalled();
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
      input_params: expect.any(Object),
      status: "processing",
    });
    const mainAttemptQuery = mocks.jobUpdateQueries.find(
      (query) => query.payload === mainAttempt
    );
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

  it("retains the reservation when provider submission is transport-indeterminate", async () => {
    mocks.submit.mockRejectedValueOnce(new TypeError("fetch failed"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await submitJob({
      userId: "user-1",
      tool: "scene",
      modelKey: "bria-product-shot",
      imageUrl: "https://cdn.example/product.png",
      prompt: "Studio product photo",
      reservedCredit: {
        txId: "tx-bundle-scene",
        amount: MODELS["bria-product-shot"].creditCost,
      },
    });

    expect(result).toMatchObject({
      jobId: "job-1",
      requestId: null,
      submissionState: "indeterminate",
      warning: "provider_submission_outcome_indeterminate",
    });
    expect(mocks.refundCredits).not.toHaveBeenCalled();
    expect(mocks.failJobAndRefund).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("atomically fails and refunds a definitive provider rejection", async () => {
    mocks.submit.mockRejectedValueOnce({
      status: 403,
      body: { detail: "forbidden" },
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      submitJob({
        userId: "user-1",
        tool: "scene",
        modelKey: "bria-product-shot",
        imageUrl: "https://cdn.example/product.png",
        prompt: "Studio product photo",
        reservedCredit: {
          txId: "tx-bundle-scene",
          amount: MODELS["bria-product-shot"].creditCost,
        },
      })
    ).rejects.toThrow("AI processing service temporarily unavailable");

    expect(mocks.failJobAndRefund).toHaveBeenCalledWith({
      jobId: "job-1",
      errorMessage: "AI processing service temporarily unavailable",
    });
    expect(mocks.refundCredits).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("does not refund after provider acceptance when DB persistence stays unavailable", async () => {
    mocks.jobUpdateEq
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValue({ error: { message: "database unavailable" } });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await submitJob({
      userId: "user-1",
      tool: "scene",
      modelKey: "bria-product-shot",
      imageUrl: "https://cdn.example/product.png",
      prompt: "Studio product photo",
      reservedCredit: {
        txId: "tx-bundle-scene",
        amount: MODELS["bria-product-shot"].creditCost,
      },
    });

    expect(result).toMatchObject({
      requestId: "fal-request-1",
      submissionState: "accepted_reconciliation_pending",
      warning: "provider_acceptance_persistence_pending",
    });
    expect(mocks.refundCredits).not.toHaveBeenCalled();
    expect(mocks.failJobAndRefund).not.toHaveBeenCalled();
    expect(mocks.jobUpdateEq).toHaveBeenCalledTimes(4);
    error.mockRestore();
  });

  it("uses a pre-reserved bundle transaction without charging twice", async () => {
    const result = await submitJob({
      userId: "user-1",
      tool: "scene",
      modelKey: "bria-product-shot",
      imageUrl: "https://cdn.example/product.png",
      prompt: "Studio product photo",
      reservedCredit: {
        txId: "tx-bundle-scene",
        amount: MODELS["bria-product-shot"].creditCost,
      },
    });

    expect(result.creditCost).toBe(MODELS["bria-product-shot"].creditCost);
    expect(mocks.reserveCredits).not.toHaveBeenCalled();
    expect(mocks.refundCredits).not.toHaveBeenCalled();
    expect(mocks.submit).toHaveBeenCalledOnce();
  });

  it("never regresses a webhook-terminal job in the late acceptance write", async () => {
    await submitJob({
      userId: "user-1",
      tool: "scene",
      modelKey: "bria-product-shot",
      imageUrl: "https://cdn.example/product.png",
      prompt: "Studio product photo",
      reservedCredit: {
        txId: "tx-bundle-scene",
        amount: MODELS["bria-product-shot"].creditCost,
      },
    });

    const acceptanceUpdates = mocks.jobUpdates.filter(
      (update) => update.fal_request_id === "fal-request-1"
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
                endpointId: "fal-ai/bria/product-shot",
                state: "submission_attempted",
              },
            },
          ],
        },
      ])
    );
  });

  it("refunds and rejects a pre-reservation whose amount does not match the model", async () => {
    await expect(
      submitJob({
        userId: "user-1",
        tool: "scene",
        modelKey: "bria-product-shot",
        imageUrl: "https://cdn.example/product.png",
        reservedCredit: { txId: "tx-wrong", amount: 1 },
      })
    ).rejects.toThrow("Reserved credit mismatch");

    expect(mocks.events).toEqual(["refund"]);
    expect(mocks.reserveCredits).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
