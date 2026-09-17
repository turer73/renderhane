import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rateLimit: vi.fn(),
  cancelJobAndRefund: vi.fn(),
  jobSingle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
  RATE_LIMITS: { jobSubmit: { limit: 10, windowSeconds: 60 } },
}));
vi.mock("@/lib/jobs/webhook-transitions", () => ({
  cancelJobAndRefund: mocks.cancelJobAndRefund,
}));

import { POST } from "../route";

function request() {
  return new NextRequest("https://renderhane.com/api/jobs/job-1/cancel", {
    method: "POST",
  });
}

function context(id = "job-1") {
  return { params: Promise.resolve({ id }) };
}

function job(
  overrides: Partial<{
    id: string;
    user_id: string;
    status: string;
    fal_request_id: string | null;
    model_id: string;
    original_request: Record<string, unknown> | null;
  }> = {}
) {
  return {
    id: "job-1",
    user_id: "user-1",
    status: "processing",
    fal_request_id: "fal-request-1",
    model_id: "fal-ai/flux/dev",
    original_request: { tool: "scene" },
    ...overrides,
  };
}

describe("POST /api/jobs/[id]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const jobQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      single: mocks.jobSingle,
    };
    jobQuery.select.mockReturnValue(jobQuery);
    jobQuery.eq.mockReturnValue(jobQuery);

    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
        }),
      },
      from: vi.fn(() => jobQuery),
    });
    mocks.jobSingle.mockResolvedValue({ data: job(), error: null });
    mocks.rateLimit.mockResolvedValue({
      success: true,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });
    mocks.cancelJobAndRefund.mockResolvedValue("cancelled_refunded");
  });

  it.each(["pending", "processing"])(
    "fails closed for an active %s job without a ledger side effect",
    async (status) => {
      mocks.jobSingle.mockResolvedValue({ data: job({ status }), error: null });

      const response = await POST(request(), context());

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: "Active provider cancellation is temporarily unavailable",
        disposition: "not_cancellable",
      });
      expect(mocks.cancelJobAndRefund).not.toHaveBeenCalled();
    }
  );

  it("repairs an already-terminal legacy cancellation", async () => {
    mocks.jobSingle.mockResolvedValue({
      data: job({ status: "cancelled", fal_request_id: null }),
      error: null,
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      disposition: "cancelled_refunded",
    });
    expect(mocks.cancelJobAndRefund).toHaveBeenCalledWith({
      jobId: "job-1",
      reason: "Cancelled by user",
      expectedProviderRequestId: null,
    });
  });

  it("returns a retryable error when legacy repair cannot be persisted", async () => {
    mocks.jobSingle.mockResolvedValue({
      data: job({ status: "cancelled", fal_request_id: null }),
      error: null,
    });
    mocks.cancelJobAndRefund.mockRejectedValue(new Error("database unavailable"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(request(), context());

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    error.mockRestore();
  });

  it("returns a conflict when legacy repair finds a durable output", async () => {
    mocks.jobSingle.mockResolvedValue({
      data: job({ status: "cancelled", fal_request_id: null }),
      error: null,
    });
    mocks.cancelJobAndRefund.mockResolvedValue("output_present");

    const response = await POST(request(), context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      disposition: "output_present",
    });
  });

  it("rejects an already-completed job before a ledger transition", async () => {
    mocks.jobSingle.mockResolvedValue({
      data: job({ status: "completed" }),
      error: null,
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(409);
    expect(mocks.cancelJobAndRefund).not.toHaveBeenCalled();
  });

  it("rejects cancellation of a job owned by another user", async () => {
    mocks.jobSingle.mockResolvedValue({
      data: job({ user_id: "user-2" }),
      error: null,
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(403);
    expect(mocks.cancelJobAndRefund).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(401);
    expect(mocks.cancelJobAndRefund).not.toHaveBeenCalled();
  });
});
