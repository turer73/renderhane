import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  submit: vi.fn(),
  subscribeToStatus: vi.fn(),
  result: vi.fn(),
  status: vi.fn(),
}));

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: mocks.config,
    queue: {
      submit: mocks.submit,
      subscribeToStatus: mocks.subscribeToStatus,
      result: mocks.result,
      status: mocks.status,
    },
  },
}));

import { FalProvider } from "../fal-provider";

describe("FalProvider durable subscribe boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.submit.mockResolvedValue({ request_id: "fal-request-1" });
    mocks.subscribeToStatus.mockResolvedValue({ status: "COMPLETED" });
    mocks.result.mockResolvedValue({ data: { image: { url: "https://fal/result.png" } } });
  });

  it("forwards read-only abort signals without cancelling or resubmitting a job", async () => {
    const provider = new FalProvider();
    const abortSignal = new AbortController().signal;
    await provider.status("fal-ai/test", "fal-request-1", { abortSignal });
    await provider.result("fal-ai/test", "fal-request-1", { abortSignal });
    expect(mocks.status).toHaveBeenCalledWith("fal-ai/test", { requestId: "fal-request-1", abortSignal });
    expect(mocks.result).toHaveBeenCalledWith("fal-ai/test", { requestId: "fal-request-1", abortSignal });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("bounds admission transport without using the queue cancellation API", async () => {
    const provider = new FalProvider();
    const abortSignal = new AbortController().signal;
    await provider.submit("fal-ai/test", { prompt: "test" }, "https://example.com/webhook", { abortSignal });
    expect(mocks.submit).toHaveBeenCalledWith("fal-ai/test", {
      input: { prompt: "test" }, webhookUrl: "https://example.com/webhook", startTimeout: 1800, abortSignal,
    });
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.result).not.toHaveBeenCalled();
  });

  it.each(["status", "result", "submit"] as const)("bounds %s even while an SDK retry/backoff promise ignores abort", async (operation) => {
    let rejectLate!: (error: Error) => void;
    mocks[operation].mockReturnValueOnce(new Promise((_resolve, reject) => { rejectLate = reject; }));
    const controller = new AbortController();
    const provider = new FalProvider();
    const request = operation === "submit"
      ? provider.submit("fal-ai/test", {}, undefined, { abortSignal: controller.signal })
      : provider[operation]("fal-ai/test", "fal-request-1", { abortSignal: controller.signal });
    await Promise.resolve();
    controller.abort(new DOMException("deadline", "TimeoutError"));
    await expect(request).rejects.toThrow("deadline");
    rejectLate(new Error("late SDK rejection"));
    await Promise.resolve();
    expect(mocks[operation]).toHaveBeenCalledTimes(1);
    expect(mocks.subscribeToStatus).not.toHaveBeenCalled();
  });

  it("never starts admission with an already expired deadline", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("deadline", "TimeoutError"));
    await expect(new FalProvider().submit("fal-ai/test", {}, undefined, { abortSignal: controller.signal })).rejects.toThrow("deadline");
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("awaits request-id persistence before polling for the result", async () => {
    const events: string[] = [];
    mocks.subscribeToStatus.mockImplementation(async () => {
      events.push("poll");
      return { status: "COMPLETED" };
    });

    const provider = new FalProvider();
    const result = await provider.subscribe(
      "fal-ai/test",
      { prompt: "test" },
      {
        webhookUrl: "https://example.com/webhook",
        onEnqueue: async (requestId) => {
          await Promise.resolve();
          events.push(`persist:${requestId}`);
        },
      }
    );

    expect(events).toEqual(["persist:fal-request-1", "poll"]);
    expect(result).toEqual({
      requestId: "fal-request-1",
      data: { image: { url: "https://fal/result.png" } },
    });
    expect(mocks.submit).toHaveBeenCalledWith("fal-ai/test", {
      input: { prompt: "test" },
      webhookUrl: "https://example.com/webhook",
      startTimeout: 1800,
    });
  });

  it("retains the accepted request ID when later polling returns an error", async () => {
    const providerError = {
      status: 422,
      message: "status polling failed",
    };
    mocks.subscribeToStatus.mockRejectedValue(providerError);

    const provider = new FalProvider();
    const thrown = await provider
      .subscribe("fal-ai/test", { prompt: "test" })
      .catch((error: unknown) => error);

    expect(thrown).toBe(providerError);
    expect(thrown).toMatchObject({
      status: 422,
      requestId: "fal-request-1",
    });
  });

  it.each([
    ["frozen", Object.freeze],
    ["sealed", Object.seal],
    ["non-extensible", Object.preventExtensions],
  ])("wraps a %s provider error without losing its identity or accepted request ID", async (_label, lock) => {
    const providerError = lock({
      status: 422,
      body: { detail: "reconciliation required" },
      message: "locked polling failure",
    });
    mocks.subscribeToStatus.mockRejectedValue(providerError);

    const provider = new FalProvider();
    const thrown = await provider
      .subscribe("fal-ai/test", { prompt: "test" })
      .catch((error: unknown) => error) as Error & {
        body?: unknown;
        cause?: unknown;
        requestId?: string;
        status?: number;
      };

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBe(providerError);
    expect(thrown.message).toBe("locked polling failure");
    expect(thrown.cause).toBe(providerError);
    expect(thrown).toMatchObject({
      status: 422,
      body: { detail: "reconciliation required" },
      requestId: "fal-request-1",
    });
  });

  it.each([
    ["string", "primitive polling failure", "primitive polling failure"],
    ["number", 503, "Provider queue polling failed"],
    ["null", null, "Provider queue polling failed"],
    ["undefined", undefined, "Provider queue polling failed"],
  ])("preserves a %s rejection as the wrapper cause", async (_label, providerError, message) => {
    mocks.subscribeToStatus.mockRejectedValue(providerError);

    const provider = new FalProvider();
    const thrown = await provider
      .subscribe("fal-ai/test", { prompt: "test" })
      .catch((error: unknown) => error) as Error & {
        cause?: unknown;
        requestId?: string;
      };

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.message).toBe(message);
    expect(thrown.cause).toBe(providerError);
    expect(thrown.requestId).toBe("fal-request-1");
  });

  it("overwrites a configurable stale request ID on the original error", async () => {
    const providerError = Object.assign(new Error("polling failed"), {
      requestId: "stale-request-id",
    });
    mocks.subscribeToStatus.mockRejectedValue(providerError);

    const provider = new FalProvider();
    const thrown = await provider
      .subscribe("fal-ai/test", { prompt: "test" })
      .catch((error: unknown) => error);

    expect(thrown).toBe(providerError);
    expect(thrown).toMatchObject({ requestId: "fal-request-1" });
  });

  it("wraps a non-configurable stale request ID with the accepted ID", async () => {
    const providerError = new Error("polling failed");
    Object.defineProperty(providerError, "requestId", {
      configurable: false,
      value: "stale-request-id",
    });
    mocks.subscribeToStatus.mockRejectedValue(providerError);

    const provider = new FalProvider();
    const thrown = await provider
      .subscribe("fal-ai/test", { prompt: "test" })
      .catch((error: unknown) => error) as Error & {
        cause?: unknown;
        requestId?: string;
      };

    expect(thrown).not.toBe(providerError);
    expect(thrown.cause).toBe(providerError);
    expect(thrown.requestId).toBe("fal-request-1");
    expect(providerError).toMatchObject({ requestId: "stale-request-id" });
  });

  it("wraps a proxy that hides an attached request ID", async () => {
    const providerError = new Proxy(
      { status: 422, message: "hidden request ID" },
      {
        defineProperty: () => true,
        get: (target, property, receiver) =>
          property === "requestId"
            ? undefined
            : Reflect.get(target, property, receiver),
      }
    );
    mocks.subscribeToStatus.mockRejectedValue(providerError);

    const provider = new FalProvider();
    const thrown = await provider
      .subscribe("fal-ai/test", { prompt: "test" })
      .catch((error: unknown) => error) as Error & {
        cause?: unknown;
        requestId?: string;
      };

    expect(thrown).not.toBe(providerError);
    expect(thrown.cause).toBe(providerError);
    expect(thrown.requestId).toBe("fal-request-1");
  });

  it("does not attach a request ID when queue submission itself fails", async () => {
    const providerError = new Error("queue admission failed");
    mocks.submit.mockRejectedValue(providerError);

    const provider = new FalProvider();
    const thrown = await provider
      .subscribe("fal-ai/test", { prompt: "test" })
      .catch((error: unknown) => error);

    expect(thrown).toBe(providerError);
    expect(providerError).not.toHaveProperty("requestId");
  });

  it.each(["persistence", "result"])(
    "retains the accepted request ID after a %s failure",
    async (failurePoint) => {
      const providerError = new Error(`${failurePoint} failed`);
      if (failurePoint === "result") {
        mocks.result.mockRejectedValue(providerError);
      }

      const provider = new FalProvider();
      const thrown = await provider
        .subscribe("fal-ai/test", { prompt: "test" }, {
          onEnqueue:
            failurePoint === "persistence"
              ? async () => {
                  throw providerError;
                }
              : undefined,
        })
        .catch((error: unknown) => error);

      expect(thrown).toBe(providerError);
      expect(thrown).toMatchObject({ requestId: "fal-request-1" });
    }
  );

  it("preserves Fal's completed error fields for reconciliation", async () => {
    mocks.status.mockResolvedValue({
      status: "COMPLETED",
      request_id: "fal-request-1",
      error: "Voice input was rejected",
      error_type: "UserError",
    });

    const provider = new FalProvider();
    await expect(
      provider.status("fal-ai/f5-tts", "fal-request-1")
    ).resolves.toMatchObject({
      status: "COMPLETED",
      error: "Voice input was rejected",
      error_type: "UserError",
    });
  });
});
