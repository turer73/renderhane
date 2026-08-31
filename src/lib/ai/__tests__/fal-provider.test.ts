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
    mocks.subscribeToStatus.mockRejectedValue({
      status: 422,
      message: "status polling failed",
    });

    const provider = new FalProvider();
    await expect(
      provider.subscribe("fal-ai/test", { prompt: "test" })
    ).rejects.toMatchObject({
      status: 422,
      requestId: "fal-request-1",
    });
  });

  it("wraps a frozen provider error without losing the accepted request ID", async () => {
    mocks.subscribeToStatus.mockRejectedValue(
      Object.freeze({ status: 422, message: "frozen polling failure" })
    );

    const provider = new FalProvider();
    await expect(
      provider.subscribe("fal-ai/test", { prompt: "test" })
    ).rejects.toMatchObject({
      status: 422,
      requestId: "fal-request-1",
    });
  });

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
