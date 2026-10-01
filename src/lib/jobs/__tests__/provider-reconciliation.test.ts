import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileAcceptedProviderJob, type AcceptedProviderJob } from "../provider-reconciliation";

const mocks = vi.hoisted(() => ({
  status: vi.fn(), result: vi.fn(), submit: vi.fn(), subscribe: vi.fn(),
  rpc: vi.fn(), abortSignal: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({ getAIProvider: () => mocks }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));

const job: AcceptedProviderJob = {
  id: "job-1", model_id: "fal-ai/test", status: "processing", credit_tx_id: "tx-1", fal_request_id: "fal-1",
  original_request: { tool: "scene", providerReconciliation: {
    stage: "main", state: "accepted", endpointId: "fal-ai/test", requestId: "fal-1",
  } },
};
const originalSecret = process.env.FAL_WEBHOOK_SECRET;

describe("accepted main provider request recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.FAL_WEBHOOK_SECRET = "test-webhook-secret";
    mocks.status.mockResolvedValue({ status: "COMPLETED", request_id: "fal-1" });
    mocks.result.mockResolvedValue({ image: { url: "https://fal.example/result.png" } });
    mocks.rpc.mockReturnValue({ abortSignal: mocks.abortSignal });
    mocks.abortSignal.mockResolvedValue({ data: 123, error: null });
  });
  afterEach(() => {
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.subscribe).not.toHaveBeenCalled();
    if (originalSecret === undefined) delete process.env.FAL_WEBHOOK_SECRET;
    else process.env.FAL_WEBHOOK_SECRET = originalSecret;
  });

  it("reads an existing completed result and durably queues its normal webhook", async () => {
    const signal = new AbortController().signal;
    expect(await reconcileAcceptedProviderJob(job, signal)).toBe("webhook_queued");
    expect(mocks.status).toHaveBeenCalledWith(job.model_id, "fal-1", { abortSignal: signal });
    expect(mocks.result).toHaveBeenCalledWith(job.model_id, "fal-1", { abortSignal: signal });
    expect(mocks.rpc).toHaveBeenCalledWith("enqueue_webhook", {
      p_payload: { status: "OK", request_id: "fal-1", payload: { image: { url: "https://fal.example/result.png" } } },
      p_job_id: "job-1", p_tx_id: "tx-1", p_signature: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(mocks.abortSignal).toHaveBeenCalledWith(signal);
  });

  it("accepts a Postgres bigint queue receipt returned as a string", async () => {
    mocks.abortSignal.mockResolvedValue({ data: "123", error: null });
    expect(await reconcileAcceptedProviderJob(job)).toBe("webhook_queued");
  });

  it("recovers legacy main requests using the actual saved endpoint", async () => {
    expect(await reconcileAcceptedProviderJob({ ...job, original_request: { tool: "scene" } })).toBe("webhook_queued");
    expect(mocks.status).toHaveBeenCalledWith("fal-ai/test", "fal-1", expect.any(Object));
  });

  it.each(["IN_QUEUE", "IN_PROGRESS"])("retains reservations while %s", async (status) => {
    mocks.status.mockResolvedValue({ status, request_id: "fal-1" });
    expect(await reconcileAcceptedProviderJob(job)).toBe("provider_pending");
    expect(mocks.result).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 408, 422, 429, 500])("does not turn status HTTP %s into terminal evidence/refund", async (status) => {
    mocks.status.mockRejectedValue({ status });
    expect(await reconcileAcceptedProviderJob(job)).toBe("provider_pending");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps a completed request recoverable when result retrieval fails", async () => {
    mocks.result.mockRejectedValue(new Error("network timeout"));
    expect(await reconcileAcceptedProviderJob(job)).toBe("provider_pending");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([{ error: "generation failed" }, { error_type: "MODEL_ERROR" }])("queues only a request-bound COMPLETED provider error: %j", async (error) => {
    mocks.status.mockResolvedValue({ status: "COMPLETED", request_id: "fal-1", ...error });
    expect(await reconcileAcceptedProviderJob(job)).toBe("webhook_queued");
    expect(mocks.result).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("enqueue_webhook", expect.objectContaining({
      p_payload: { status: "ERROR", request_id: "fal-1", payload: { message: Object.values(error)[0] } },
    }));
  });

  it.each(["FAILED", "ERROR", "CANCELLED", "unknown"])("does not guess from an undocumented state %s", async (status) => {
    mocks.status.mockResolvedValue({ status, request_id: "fal-1", error: "bad" });
    expect(await reconcileAcceptedProviderJob(job)).toBe("review_required");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(["another-request", undefined])("rejects missing/mismatched provider identity %s", async (request_id) => {
    mocks.status.mockResolvedValue({ status: "COMPLETED", request_id });
    expect(await reconcileAcceptedProviderJob(job)).toBe("review_required");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([null, [], "invalid", { unexpected: true }, { image: { url: "http://127.0.0.1/private" } }])("does not refund/charge for an unrecognized result %j", async (payload) => {
    mocks.result.mockResolvedValue(payload);
    expect(await reconcileAcceptedProviderJob(job)).toBe("review_required");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { stage: "tts", state: "accepted", endpointId: "fal-ai/tts", requestId: "fal-1" },
    { stage: "main", state: "accepted", endpointId: "wrong", requestId: "fal-1" },
    { stage: "main", state: "accepted", endpointId: "fal-ai/test", requestId: "wrong" },
    { stage: "main", state: "submission_attempted", endpointId: "fal-ai/test" },
  ])("does not reinterpret another stage or mismatched marker %j", async (marker) => {
    expect(await reconcileAcceptedProviderJob({ ...job, original_request: { providerReconciliation: marker } }))
      .toBe(marker.stage === "tts" ? "not_applicable" : "review_required");
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("leaves an unacknowledged submit for manual recovery", async () => {
    expect(await reconcileAcceptedProviderJob({ ...job, fal_request_id: null })).toBe("not_applicable");
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it("does not confuse a legacy avatar TTS request with its final video", async () => {
    expect(await reconcileAcceptedProviderJob({ ...job, original_request: { tool: "talking-avatar" } })).toBe("review_required");
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it.each(["completed", "failed", "cancelled"])("ignores a terminal local job %s", async (status) => {
    expect(await reconcileAcceptedProviderJob({ ...job, status })).toBe("not_applicable");
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it.each([null, 0, -1, "0", "invalid"])("requires a durable enqueue receipt instead of accepting %j", async (data) => {
    mocks.abortSignal.mockResolvedValue({ data, error: null });
    expect(await reconcileAcceptedProviderJob(job)).toBe("provider_pending");
  });

  it("leaves the job active when queue persistence fails", async () => {
    mocks.abortSignal.mockResolvedValue({ data: null, error: { message: "DB unavailable" } });
    expect(await reconcileAcceptedProviderJob(job)).toBe("provider_pending");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("does not enqueue after the read deadline expires", async () => {
    const controller = new AbortController();
    mocks.result.mockImplementation(async () => {
      controller.abort();
      return { image: { url: "https://fal.example/result.png" } };
    });
    expect(await reconcileAcceptedProviderJob(job, controller.signal)).toBe("provider_pending");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
