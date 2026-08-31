import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

import {
  cancelJobAndRefund,
  completeJobOutputAndSpend,
  failJobAndRefund,
} from "../webhook-transitions";

describe("atomic webhook transition RPC helpers", () => {
  beforeEach(() => rpc.mockReset());

  it("maps the authoritative completion row", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          disposition: "completed",
          output_id: "output-1",
          result_user_id: "user-1",
          result_project_id: "project-1",
          result_output_type: "image",
          result_r2_url: null,
        },
      ],
      error: null,
    });

    await expect(
      completeJobOutputAndSpend({
        jobId: "job-1",
        falUrl: "https://provider.example/result.png",
        metadata: { image: { url: "https://provider.example/result.png" } },
      })
    ).resolves.toEqual({
      disposition: "completed",
      outputId: "output-1",
      userId: "user-1",
      projectId: "project-1",
      outputType: "image",
      r2Url: null,
    });
  });

  it("propagates an atomic completion failure for webhook retry", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "serialization failure" } });

    await expect(
      completeJobOutputAndSpend({
        jobId: "job-1",
        falUrl: "https://provider.example/result.png",
        metadata: {},
      })
    ).rejects.toThrow("serialization failure");
  });

  it("passes the stale cutoff into the atomic failure/refund RPC", async () => {
    rpc.mockResolvedValue({ data: "not_eligible", error: null });

    await expect(
      failJobAndRefund({
        jobId: "job-1",
        errorMessage: "timeout",
        staleBefore: "2026-08-31T00:00:00.000Z",
      })
    ).resolves.toBe("not_eligible");
    expect(rpc).toHaveBeenCalledWith("fail_job_and_refund", {
      p_job_id: "job-1",
      p_error_message: "timeout",
      p_stale_before: "2026-08-31T00:00:00.000Z",
    });
  });

  it("accepts an atomically repaired durable output", async () => {
    rpc.mockResolvedValue({ data: "output_repaired", error: null });

    await expect(
      failJobAndRefund({
        jobId: "job-legacy-output",
        errorMessage: "stale snapshot",
      })
    ).resolves.toBe("output_repaired");
  });

  it.each([
    "cancelled_refunded",
    "already_cancelled_refunded",
    "cancelled_no_charge",
    "already_completed",
    "not_cancellable",
    "output_present",
  ] as const)("accepts the authoritative cancellation disposition %s", async (disposition) => {
    rpc.mockResolvedValue({ data: disposition, error: null });

    await expect(
      cancelJobAndRefund({
        jobId: "job-1",
        reason: "Cancelled by user",
        expectedProviderRequestId: "fal-request-1",
      })
    ).resolves.toBe(disposition);

    expect(rpc).toHaveBeenCalledWith("cancel_job_and_refund", {
      p_job_id: "job-1",
      p_reason: "Cancelled by user",
      p_expected_fal_request_id: "fal-request-1",
    });
  });

  it("propagates an atomic cancellation failure without inventing terminal state", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "serialization failure" },
    });

    await expect(
      cancelJobAndRefund({
        jobId: "job-1",
        reason: "Cancelled by user",
        expectedProviderRequestId: "fal-request-1",
      })
    ).rejects.toThrow("serialization failure");
  });

  it("rejects an unknown cancellation disposition", async () => {
    rpc.mockResolvedValue({ data: "cancelled_without_refund", error: null });

    await expect(
      cancelJobAndRefund({
        jobId: "job-1",
        reason: "Cancelled by user",
        expectedProviderRequestId: "fal-request-1",
      })
    ).rejects.toThrow("invalid database response");
  });
});
