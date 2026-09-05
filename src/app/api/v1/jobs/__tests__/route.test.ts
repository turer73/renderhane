import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { CreditError } from "@/lib/credits/engine";

const mocks = vi.hoisted(() => ({
  authenticateApiRequest: vi.fn(),
  submitJob: vi.fn(),
  submitJobSync: vi.fn(),
  orchestrateAplus: vi.fn(),
  orchestrateTalkingAvatar: vi.fn(),
  orchestrateSocialKit: vi.fn(),
  claimSocialKitRequest: vi.fn(),
  completeSocialKitRequest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-keys/middleware", () => ({
  authenticateApiRequest: mocks.authenticateApiRequest,
}));
vi.mock("@/lib/jobs/submit", () => ({ submitJob: mocks.submitJob }));
vi.mock("@/lib/jobs/submit-sync", () => ({
  submitJobSync: mocks.submitJobSync,
}));
vi.mock("@/lib/jobs/orchestrate", () => ({
  orchestrateAplus: mocks.orchestrateAplus,
  orchestrateTalkingAvatar: mocks.orchestrateTalkingAvatar,
  orchestrateSocialKit: mocks.orchestrateSocialKit,
}));
vi.mock("@/lib/jobs/social-kit-idempotency", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/jobs/social-kit-idempotency")>();
  return {
    ...original,
    claimSocialKitRequest: mocks.claimSocialKitRequest,
    completeSocialKitRequest: mocks.completeSocialKitRequest,
  };
});

import { POST } from "../route";

function request(body: Record<string, unknown>, idempotencyKey?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  return new NextRequest("https://renderhane.com/api/v1/jobs", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("public job submission reconciliation status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SOCIAL_KIT_SUBMISSIONS_DISABLED;
    mocks.authenticateApiRequest.mockResolvedValue({ userId: "user-1" });
    mocks.claimSocialKitRequest.mockResolvedValue({
      disposition: "acquired",
      requestId: "social-request-1",
    });
    mocks.completeSocialKitRequest.mockResolvedValue(undefined);
    mocks.orchestrateSocialKit.mockResolvedValue({
      jobIds: ["social-job-1"],
      totalCost: 8,
      estimatedTime: "~1min",
      submissionStates: { "social-job-1": "accepted" },
    });
  });

  it("returns 202 instead of 500 for an indeterminate sync provider result", async () => {
    mocks.submitJobSync.mockResolvedValue({
      jobId: "job-1",
      creditCost: 8,
      status: "processing",
      submissionState: "indeterminate",
      warning: "provider_submission_outcome_indeterminate",
    });

    const response = await POST(
      request({ tool: "scene", imageUrl: "https://cdn.example/item.png", sync: true })
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("retry-after")).toBe("30");
    await expect(response.json()).resolves.toMatchObject({
      jobId: "job-1",
      status: "processing",
      submissionState: "indeterminate",
    });
  });

  it("returns 202 for an async submission whose provider state needs reconciliation", async () => {
    mocks.submitJob.mockResolvedValue({
      jobId: "job-2",
      requestId: null,
      creditCost: 8,
      estimatedTime: "~1min",
      submissionState: "indeterminate",
    });

    const response = await POST(
      request({ tool: "scene", imageUrl: "https://cdn.example/item.png" })
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("retry-after")).toBe("30");
  });

  it("returns 202 when an orchestration contains an indeterminate child", async () => {
    mocks.orchestrateAplus.mockResolvedValue({
      jobIds: ["job-3", "job-4"],
      totalCost: 16,
      estimatedTime: "~1min",
      submissionStates: {
        "job-3": "accepted",
        "job-4": "accepted_reconciliation_pending",
      },
    });

    const response = await POST(
      request({ tool: "aplus", imageUrl: "https://cdn.example/item.png" })
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("retry-after")).toBe("30");
  });

  it("keeps the normal 201 contract when provider acceptance is durable", async () => {
    mocks.submitJob.mockResolvedValue({
      jobId: "job-5",
      requestId: "provider-5",
      creditCost: 8,
      estimatedTime: "~1min",
      submissionState: "accepted",
    });

    const response = await POST(
      request({ tool: "scene", imageUrl: "https://cdn.example/item.png" })
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("retry-after")).toBeNull();
  });

  it("fails closed before Social Kit charging when Idempotency-Key is missing", async () => {
    const response = await POST(
      request({ tool: "social-kit", imageUrl: "https://cdn.example/item.png" })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_idempotency_key",
    });
    expect(mocks.claimSocialKitRequest).not.toHaveBeenCalled();
    expect(mocks.orchestrateSocialKit).not.toHaveBeenCalled();
  });

  it("applies the Social Kit kill switch to the public API before claiming", async () => {
    process.env.SOCIAL_KIT_SUBMISSIONS_DISABLED = "true";

    const response = await POST(
      request(
        { tool: "social-kit", imageUrl: "https://cdn.example/item.png" },
        "public-social-key-1"
      )
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("300");
    expect(mocks.claimSocialKitRequest).not.toHaveBeenCalled();
    expect(mocks.orchestrateSocialKit).not.toHaveBeenCalled();
  });

  it("binds public Social Kit to the durable claim and persists its response", async () => {
    const response = await POST(
      request(
        {
          tool: "social-kit",
          imageUrl: "https://cdn.example/item.png",
          locale: "en",
        },
        "public-social-key-1"
      )
    );

    expect(response.status).toBe(201);
    expect(mocks.claimSocialKitRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        idempotencyKey: "public-social-key-1",
        requestHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
    );
    expect(mocks.orchestrateSocialKit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        requestId: "social-request-1",
        locale: "en",
      })
    );
    expect(mocks.completeSocialKitRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "social-request-1",
        responseStatus: 201,
      })
    );
  });

  it("keeps public Social Kit processing when a child is indeterminate", async () => {
    mocks.orchestrateSocialKit.mockResolvedValue({
      jobIds: ["social-job-1"],
      totalCost: 8,
      estimatedTime: "~1min",
      submissionStates: { "social-job-1": "indeterminate" },
    });

    const response = await POST(
      request(
        { tool: "social-kit", imageUrl: "https://cdn.example/item.png" },
        "public-social-key-1"
      )
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(mocks.completeSocialKitRequest).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      requestId: "social-request-1",
      idempotency: {
        outcome: "reconciliation_pending",
        keyAction: "retain",
      },
    });
  });

  it("replays the durable public Social Kit response without orchestration", async () => {
    mocks.claimSocialKitRequest.mockResolvedValue({
      disposition: "replay",
      requestId: "social-request-1",
      responseStatus: 201,
      responseBody: { jobIds: ["social-job-1"] },
      responseHeaders: { "X-Request-Version": "1" },
    });

    const response = await POST(
      request(
        { tool: "social-kit", imageUrl: "https://cdn.example/item.png" },
        "public-social-key-1"
      )
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("idempotency-replayed")).toBe("true");
    expect(response.headers.get("x-request-version")).toBe("1");
    expect(mocks.orchestrateSocialKit).not.toHaveBeenCalled();
  });

  it("returns 202 without orchestration while public Social Kit is active", async () => {
    mocks.claimSocialKitRequest.mockResolvedValue({
      disposition: "in_progress",
      requestId: "social-request-1",
    });

    const response = await POST(
      request(
        { tool: "social-kit", imageUrl: "https://cdn.example/item.png" },
        "public-social-key-1"
      )
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("retry-after")).toBe("2");
    expect(mocks.orchestrateSocialKit).not.toHaveBeenCalled();
  });

  it("returns 409 when a public Social Kit key is reused with another payload", async () => {
    mocks.claimSocialKitRequest.mockResolvedValue({
      disposition: "conflict",
      requestId: "social-request-1",
    });

    const response = await POST(
      request(
        { tool: "social-kit", imageUrl: "https://cdn.example/changed.png" },
        "public-social-key-1"
      )
    );

    expect(response.status).toBe(409);
    expect(mocks.orchestrateSocialKit).not.toHaveBeenCalled();
  });

  it("leaves public Social Kit processing after an ambiguous orchestration error", async () => {
    mocks.orchestrateSocialKit.mockRejectedValue(new TypeError("connection reset"));

    const response = await POST(
      request(
        { tool: "social-kit", imageUrl: "https://cdn.example/item.png" },
        "public-social-key-1"
      )
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(mocks.completeSocialKitRequest).not.toHaveBeenCalled();
  });

  it("persists an atomic insufficient-credit outcome for public Social Kit", async () => {
    mocks.orchestrateSocialKit.mockRejectedValue(
      new CreditError("Insufficient credits", "INSUFFICIENT")
    );

    const response = await POST(
      request(
        { tool: "social-kit", imageUrl: "https://cdn.example/item.png" },
        "public-social-key-1"
      )
    );

    expect(response.status).toBe(402);
    expect(mocks.completeSocialKitRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "social-request-1",
        responseStatus: 402,
        responseBody: expect.objectContaining({ error: "insufficient_credits" }),
      })
    );
  });
});
