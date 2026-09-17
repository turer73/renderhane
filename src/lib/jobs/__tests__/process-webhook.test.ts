import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  completeJobOutputAndSpend: vi.fn(),
  failJobAndRefund: vi.fn(),
  uploadToR2: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/jobs/webhook-transitions", () => ({
  completeJobOutputAndSpend: mocks.completeJobOutputAndSpend,
  failJobAndRefund: mocks.failJobAndRefund,
}));
vi.mock("@/lib/r2/upload", () => ({ uploadToR2: mocks.uploadToR2 }));

import { processWebhookEvent } from "../process-webhook";

function updateQuery(error: { message: string } | null = null) {
  const secondEq = vi.fn().mockResolvedValue({ error });
  const firstEq = vi.fn(() => ({ eq: secondEq }));
  const update = vi.fn(() => ({ eq: firstEq }));
  return { update, firstEq, secondEq };
}

describe("processWebhookEvent atomic transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.failJobAndRefund.mockResolvedValue("failed_refunded");
    mocks.completeJobOutputAndSpend.mockResolvedValue({
      disposition: "completed",
      outputId: "output-1",
      userId: "user-1",
      projectId: null,
      outputType: "image",
      r2Url: "https://r2.example/already-uploaded.png",
    });
  });

  it("keeps the webhook retryable when atomic failure/refund is unavailable", async () => {
    mocks.failJobAndRefund.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      processWebhookEvent({
        jobId: "job-1",
        txId: "untrusted-webhook-tx",
        body: { status: "ERROR", payload: { message: "provider failed" } },
      })
    ).rejects.toThrow("database unavailable");

    expect(mocks.failJobAndRefund).toHaveBeenCalledWith({
      jobId: "job-1",
      errorMessage: "provider failed",
    });
  });

  it("uses the job-bound atomic RPC rather than the webhook txId", async () => {
    await expect(
      processWebhookEvent({
        jobId: "job-2",
        txId: "attacker-controlled-tx",
        body: { status: "ERROR", payload: { message: "provider failed" } },
      })
    ).resolves.toEqual({ ok: true });

    expect(mocks.failJobAndRefund).toHaveBeenCalledWith({
      jobId: "job-2",
      errorMessage: "provider failed",
    });
  });

  it("atomically fails/refunds an OK response with no usable output", async () => {
    await expect(
      processWebhookEvent({
        jobId: "job-no-output",
        txId: "tx-no-output",
        body: { status: "OK", payload: { unexpected: true } },
      })
    ).resolves.toEqual({ ok: true });

    expect(mocks.failJobAndRefund).toHaveBeenCalledWith({
      jobId: "job-no-output",
      errorMessage: "Output could not be extracted from AI response",
    });
    expect(mocks.completeJobOutputAndSpend).not.toHaveBeenCalled();
  });

  it("commits output, job and spend through one RPC before R2 enrichment", async () => {
    const outputUpdate = updateQuery();
    const projectUpdate = updateQuery();
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((table: string) =>
        table === "outputs" ? outputUpdate : projectUpdate
      ),
    });
    mocks.completeJobOutputAndSpend.mockResolvedValue({
      disposition: "completed",
      outputId: "output-1",
      userId: "user-1",
      projectId: "project-1",
      outputType: "image",
      r2Url: null,
    });
    mocks.uploadToR2.mockResolvedValue({
      r2Url: "https://r2.example/result.png",
      fileSize: 123,
    });

    await expect(
      processWebhookEvent({
        jobId: "job-success",
        txId: "ignored-tx",
        body: {
          status: "OK",
          payload: { image: { url: "https://provider.example/result.png" } },
        },
      })
    ).resolves.toEqual({ ok: true });

    expect(mocks.completeJobOutputAndSpend).toHaveBeenCalledWith({
      jobId: "job-success",
      falUrl: "https://provider.example/result.png",
      metadata: { image: { url: "https://provider.example/result.png" } },
    });
    expect(mocks.uploadToR2).toHaveBeenCalledAfter(
      mocks.completeJobOutputAndSpend
    );
    expect(projectUpdate.firstEq).toHaveBeenCalledWith("id", "project-1");
    expect(projectUpdate.secondEq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("does not enrich a late success after an atomic refund", async () => {
    mocks.completeJobOutputAndSpend.mockResolvedValue({
      disposition: "terminal_conflict",
      outputId: null,
      userId: "user-1",
      projectId: null,
      outputType: null,
      r2Url: null,
    });

    await expect(
      processWebhookEvent({
        jobId: "job-refunded",
        txId: "tx-refunded",
        body: {
          status: "OK",
          payload: { image: { url: "https://provider.example/late.png" } },
        },
      })
    ).resolves.toEqual({ ok: true });

    expect(mocks.uploadToR2).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
