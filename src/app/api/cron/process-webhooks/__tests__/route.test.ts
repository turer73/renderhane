import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  processWebhookEvent: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/jobs/process-webhook", () => ({
  processWebhookEvent: mocks.processWebhookEvent,
}));

import { GET } from "../route";

type RpcResult = { data: unknown; error: { message: string } | null };

function cronRequest() {
  return new NextRequest("https://renderhane.com/api/cron/process-webhooks", {
    headers: { authorization: "Bearer cron-secret" },
  });
}

function message(id: number, jobId: string) {
  return { id, job_id: jobId, tx_id: null, signature: "sig", attempts: 1, payload: { status: "OK" } };
}

function installQueue(messages: unknown[], acks: Record<string, (id: unknown) => RpcResult> = {}) {
  mocks.rpc.mockImplementation(async (fn: string, args: { p_id?: unknown }): Promise<RpcResult> => {
    if (fn === "dequeue_webhooks") return { data: messages, error: null };
    if (fn === "complete_webhook" || fn === "fail_webhook") {
      return acks[fn]?.(args.p_id) ?? { data: null, error: null };
    }
    throw new Error(`Unexpected RPC ${fn}`);
  });
  mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc });
}

function summaryLines(log: { mock: { calls: unknown[][] } }) {
  return log.mock.calls
    .map(([line]) => String(line))
    .filter((line) => line.startsWith("[process-webhooks] summary "));
}

describe("GET /api/cron/process-webhooks", () => {
  const originalSecret = process.env.CRON_SECRET;
  let log: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-secret";
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.processWebhookEvent.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    log.mockRestore();
    error.mockRestore();
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("stays silent when the queue is empty", async () => {
    installQueue([]);

    const response = await GET(cronRequest());

    await expect(response.json()).resolves.toEqual({ processed: 0 });
    expect(summaryLines(log)).toHaveLength(0);
  });

  it("logs one counters-only summary for a run that dequeued work", async () => {
    installQueue([message(1, "job-private-a"), message(2, "job-private-b")]);
    mocks.processWebhookEvent
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: "provider error" });

    const body = await (await GET(cronRequest())).json();

    expect(body).toEqual({ dequeued: 2, processed: 1, failed: 1, ackFailed: 0 });
    const lines = summaryLines(log);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0].slice("[process-webhooks] summary ".length))).toEqual(body);
    expect(lines[0]).not.toContain("job-private");
    expect(mocks.rpc).toHaveBeenCalledWith("complete_webhook", { p_id: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith("fail_webhook", { p_id: 2, p_error: "provider error" });
  });

  it("reports a lost acknowledgement instead of counting a clean pass", async () => {
    installQueue([message(1, "job-a"), message(2, "job-b")], {
      complete_webhook: (id) =>
        id === 2 ? { data: null, error: { message: "ack lost" } } : { data: null, error: null },
    });

    const body = await (await GET(cronRequest())).json();

    expect(body).toEqual({ dequeued: 2, processed: 2, failed: 0, ackFailed: 1 });
    expect(error).toHaveBeenCalledWith(
      "[process-webhooks] complete_webhook failed for message 2:",
      "ack lost"
    );
  });

  it("logs a failed failure acknowledgement after a processing error", async () => {
    installQueue([message(7, "job-c")], {
      fail_webhook: () => ({ data: null, error: { message: "queue unavailable" } }),
    });
    mocks.processWebhookEvent.mockRejectedValueOnce(new Error("boom"));

    const body = await (await GET(cronRequest())).json();

    expect(body).toEqual({ dequeued: 1, processed: 0, failed: 1, ackFailed: 1 });
    expect(error).toHaveBeenCalledWith(
      "[process-webhooks] fail_webhook failed for message 7:",
      "queue unavailable"
    );
  });

  it("rejects a request without the cron secret before touching the queue", async () => {
    const response = await GET(
      new NextRequest("https://renderhane.com/api/cron/process-webhooks")
    );

    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
