import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  result: vi.fn(),
  submit: vi.fn(),
  routeRequest: vi.fn(),
  createAdminClient: vi.fn(),
  failJobAndRefund: vi.fn(),
  updates: [] as Record<string, unknown>[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({
  getAIProvider: () => ({
    status: mocks.status,
    result: mocks.result,
    submit: mocks.submit,
  }),
}));
vi.mock("@/lib/fal/smart-router", () => ({
  routeRequest: mocks.routeRequest,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/jobs/webhook-transitions", () => ({
  failJobAndRefund: mocks.failJobAndRefund,
}));

import {
  reconcileTalkingAvatarTts,
  type TalkingAvatarReconciliationJob,
} from "../talking-avatar-reconciliation";

function createSupabaseMock(claimed = true) {
  return {
    from: vi.fn(() => ({
      update: vi.fn((payload: Record<string, unknown>) => {
        const updateIndex = mocks.updates.push(payload) - 1;
        const result =
          updateIndex === 0
            ? { data: claimed ? { id: "job-avatar-1" } : null, error: null }
            : { data: { id: "job-avatar-1" }, error: null };
        const chain: Record<string, unknown> & PromiseLike<typeof result> = {
          then: (onFulfilled, onRejected) =>
            Promise.resolve(result).then(onFulfilled, onRejected),
        };
        for (const method of ["eq", "is", "in", "contains", "select"]) {
          chain[method] = vi.fn(() => chain);
        }
        chain.maybeSingle = vi.fn().mockResolvedValue(result);
        return chain;
      }),
    })),
  };
}

function acceptedTtsJob(): TalkingAvatarReconciliationJob {
  return {
    id: "job-avatar-1",
    user_id: "user-1",
    model_id: "fal-ai/bytedance/omnihuman/v1.5",
    status: "processing",
    credit_tx_id: "tx-avatar-1",
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
}

describe("talking-avatar TTS reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updates.length = 0;
    process.env.FAL_WEBHOOK_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
    mocks.status.mockResolvedValue({ status: "COMPLETED" });
    mocks.result.mockResolvedValue({
      audio_url: { url: "https://fal.media/voice.wav" },
    });
    mocks.routeRequest.mockReturnValue({
      model: { id: "fal-ai/bytedance/omnihuman/v1.5" },
      input: {
        image_url: "https://cdn.example/avatar.png",
        audio_url: "https://fal.media/voice.wav",
      },
    });
    mocks.submit.mockResolvedValue({ requestId: "fal-avatar-main-1" });
    mocks.failJobAndRefund.mockResolvedValue("failed_refunded");
    mocks.createAdminClient.mockReturnValue(createSupabaseMock());
  });

  it("single-winner resumes completed TTS into the signed main queue", async () => {
    await expect(reconcileTalkingAvatarTts(acceptedTtsJob())).resolves.toBe(
      "main_resubmitted"
    );

    expect(mocks.submit).toHaveBeenCalledWith(
      "fal-ai/bytedance/omnihuman/v1.5",
      {
        image_url: "https://cdn.example/avatar.png",
        audio_url: "https://fal.media/voice.wav",
      },
      expect.stringContaining("/api/webhook/fal?jobId=job-avatar-1&txId=tx-avatar-1&sig=")
    );
    expect(mocks.updates).toHaveLength(2);
    expect(mocks.updates[0]).toMatchObject({
      fal_request_id: null,
      status: "processing",
      original_request: {
        providerReconciliation: {
          stage: "main",
          state: "submission_attempted",
        },
      },
    });
    expect(mocks.updates[1]).toMatchObject({
      fal_request_id: "fal-avatar-main-1",
      original_request: {
        providerReconciliation: {
          stage: "main",
          state: "accepted",
          requestId: "fal-avatar-main-1",
        },
      },
    });
    expect(mocks.updates[1]).not.toHaveProperty("status");
  });

  it("does not submit main while the accepted TTS job is still running", async () => {
    mocks.status.mockResolvedValue({ status: "IN_PROGRESS" });
    await expect(reconcileTalkingAvatarTts(acceptedTtsJob())).resolves.toBe(
      "provider_pending"
    );
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.updates).toHaveLength(0);
  });

  it("atomically fails/refunds Fal's documented completed error payload", async () => {
    mocks.status.mockResolvedValue({
      status: "COMPLETED",
      error: "Voice input was rejected",
      error_type: "UserError",
    });

    await expect(reconcileTalkingAvatarTts(acceptedTtsJob())).resolves.toBe(
      "failed_refunded"
    );
    expect(mocks.failJobAndRefund).toHaveBeenCalledWith({
      jobId: "job-avatar-1",
      errorMessage:
        "TTS provider completed with error: UserError: Voice input was rejected",
    });
    expect(mocks.result).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("keeps a TTS result retrieval 4xx pending after provider acceptance", async () => {
    mocks.result.mockRejectedValue({ status: 422, message: "invalid voice" });

    await expect(reconcileTalkingAvatarTts(acceptedTtsJob())).resolves.toBe(
      "provider_pending"
    );
    expect(mocks.failJobAndRefund).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404])(
    "keeps a TTS status retrieval %s pending after provider acceptance",
    async (status) => {
      mocks.status.mockRejectedValue({ status, message: "retrieval failed" });

      await expect(reconcileTalkingAvatarTts(acceptedTtsJob())).resolves.toBe(
        "provider_pending"
      );
      expect(mocks.failJobAndRefund).not.toHaveBeenCalled();
      expect(mocks.result).not.toHaveBeenCalled();
      expect(mocks.submit).not.toHaveBeenCalled();
    }
  );

  it("clears the TTS request ID before invoking the main provider", async () => {
    mocks.submit.mockImplementation(async () => {
      expect(mocks.updates[0]).toMatchObject({ fal_request_id: null });
      return { requestId: "fal-avatar-main-1" };
    });

    await expect(reconcileTalkingAvatarTts(acceptedTtsJob())).resolves.toBe(
      "main_resubmitted"
    );
  });

  it("atomically fails/refunds a completed TTS response with no audio", async () => {
    mocks.result.mockResolvedValue({});
    await expect(reconcileTalkingAvatarTts(acceptedTtsJob())).resolves.toBe(
      "failed_refunded"
    );
    expect(mocks.failJobAndRefund).toHaveBeenCalledWith({
      jobId: "job-avatar-1",
      errorMessage: "TTS provider completed without an audio output",
    });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("does not double-submit when another reconciler already won the CAS", async () => {
    mocks.createAdminClient.mockReturnValue(createSupabaseMock(false));
    await expect(reconcileTalkingAvatarTts(acceptedTtsJob())).resolves.toBe(
      "provider_pending"
    );
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("keeps a single main attempt pending when submit transport is ambiguous", async () => {
    mocks.submit.mockRejectedValue(new TypeError("fetch failed"));
    await expect(reconcileTalkingAvatarTts(acceptedTtsJob())).resolves.toBe(
      "main_submission_indeterminate"
    );
    expect(mocks.failJobAndRefund).not.toHaveBeenCalled();
    expect(mocks.updates).toHaveLength(1);
  });

  it("atomically fails/refunds a definitive resumed main rejection", async () => {
    mocks.submit.mockRejectedValue({ status: 422, message: "invalid input" });
    await expect(reconcileTalkingAvatarTts(acceptedTtsJob())).resolves.toBe(
      "failed_refunded"
    );
    expect(mocks.failJobAndRefund).toHaveBeenCalledWith({
      jobId: "job-avatar-1",
      errorMessage: "Talking-avatar provider rejected the resumed request",
    });
  });
});
