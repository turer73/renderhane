import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { CreditError } from "@/lib/credits/engine";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  orchestrateSocialKit: vi.fn(),
  rateLimit: vi.fn(),
  claimSocialKitRequest: vi.fn(),
  completeSocialKitRequest: vi.fn(),
  profileSingle: vi.fn(),
  projectMaybeSingle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/jobs/orchestrate", () => ({
  orchestrateSocialKit: mocks.orchestrateSocialKit,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
  RATE_LIMITS: { jobSubmit: { limit: 10, windowSeconds: 60 } },
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
import { SocialKitSchemaUnavailableError } from "@/lib/jobs/social-kit-idempotency";

const fingerprint = "a".repeat(64);

function request(
  body: Record<string, unknown> = {
    imageUrl: "https://example.supabase.co/storage/v1/object/sign/uploads/product.png",
    sourceFingerprint: fingerprint,
  },
  key: string | null = "request-key-1"
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key) headers["idempotency-key"] = key;
  return new NextRequest("https://renderhane.com/api/jobs/submit-social-kit", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("submit-social-kit idempotency and release guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profileSingle.mockResolvedValue({
      data: { locale: "tr" },
      error: null,
    });
    mocks.projectMaybeSingle.mockResolvedValue({
      data: { id: "11111111-1111-4111-8111-111111111111" },
      error: null,
    });
    const profileQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      single: mocks.profileSingle,
    };
    profileQuery.select.mockReturnValue(profileQuery);
    profileQuery.eq.mockReturnValue(profileQuery);
    const projectQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: mocks.projectMaybeSingle,
    };
    projectQuery.select.mockReturnValue(projectQuery);
    projectQuery.eq.mockReturnValue(projectQuery);
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from: vi.fn((table: string) =>
        table === "projects" ? projectQuery : profileQuery
      ),
    });
    mocks.rateLimit.mockResolvedValue({
      success: true,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    });
    mocks.claimSocialKitRequest.mockResolvedValue({
      disposition: "acquired",
      requestId: "request-1",
    });
    mocks.completeSocialKitRequest.mockResolvedValue(undefined);
    mocks.orchestrateSocialKit.mockResolvedValue({
      jobIds: ["job-1"],
      totalCost: 67,
      completedJobs: 1,
      sceneCount: 1,
      hasVideo: false,
      estimatedTime: "~3min",
    });
  });

  it("fails closed before authentication when the submission kill switch is enabled", async () => {
    process.env.SOCIAL_KIT_SUBMISSIONS_DISABLED = "true";

    try {
      const response = await POST(request());
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("300");
      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(mocks.claimSocialKitRequest).not.toHaveBeenCalled();
      expect(mocks.orchestrateSocialKit).not.toHaveBeenCalled();
    } finally {
      delete process.env.SOCIAL_KIT_SUBMISSIONS_DISABLED;
    }
  });

  it("rejects a missing key before any durable or paid side effect", async () => {
    const response = await POST(request(undefined, null));
    expect(response.status).toBe(400);
    expect(mocks.claimSocialKitRequest).not.toHaveBeenCalled();
    expect(mocks.orchestrateSocialKit).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when the production migration is missing", async () => {
    mocks.claimSocialKitRequest.mockRejectedValue(
      new SocialKitSchemaUnavailableError()
    );

    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("300");
    await expect(response.json()).resolves.toMatchObject({
      error: "social_kit_temporarily_unavailable",
    });
    expect(mocks.orchestrateSocialKit).not.toHaveBeenCalled();
  });

  it("replays the stored result without rate limiting or orchestration", async () => {
    mocks.claimSocialKitRequest.mockResolvedValue({
      disposition: "replay",
      requestId: "request-1",
      responseStatus: 402,
      responseBody: { error: "insufficient_credits" },
      responseHeaders: { "Retry-After": "17" },
    });

    const response = await POST(request());
    expect(response.status).toBe(402);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(response.headers.get("idempotency-replayed")).toBe("true");
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.orchestrateSocialKit).not.toHaveBeenCalled();
  });

  it("returns 202 while the same semantic request is active", async () => {
    mocks.claimSocialKitRequest.mockResolvedValue({
      disposition: "in_progress",
      requestId: "request-active",
    });

    const response = await POST(request());
    expect(response.status).toBe(202);
    expect(response.headers.get("retry-after")).toBe("2");
    expect(mocks.orchestrateSocialKit).not.toHaveBeenCalled();
  });

  it("rejects reuse of one key for different semantic input", async () => {
    mocks.claimSocialKitRequest.mockResolvedValue({
      disposition: "conflict",
      requestId: "request-1",
    });

    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(mocks.orchestrateSocialKit).not.toHaveBeenCalled();
  });

  it("rejects a project that is not owned by the authenticated user", async () => {
    mocks.projectMaybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await POST(
      request({
        imageUrl: "https://example.supabase.co/storage/v1/object/sign/uploads/product.png",
        sourceFingerprint: fingerprint,
        projectId: "11111111-1111-4111-8111-111111111111",
      })
    );

    expect(response.status).toBe(404);
    expect(mocks.claimSocialKitRequest).not.toHaveBeenCalled();
    expect(mocks.orchestrateSocialKit).not.toHaveBeenCalled();
  });

  it("persists a successful response and passes the durable request to orchestration", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.orchestrateSocialKit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", requestId: "request-1" })
    );
    expect(mocks.completeSocialKitRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "request-1",
        responseStatus: 200,
        responseBody: expect.objectContaining({ jobIds: ["job-1"] }),
      })
    );
  });

  it("retains the durable key when a submitted child needs reconciliation", async () => {
    mocks.orchestrateSocialKit.mockResolvedValue({
      jobIds: ["job-1"],
      totalCost: 8,
      completedJobs: 1,
      sceneCount: 1,
      hasVideo: false,
      estimatedTime: "~3min",
      submissionStates: { "job-1": "indeterminate" },
      warnings: ["Scene 1: provider_submission_outcome_indeterminate"],
    });

    const response = await POST(request());

    expect(response.status).toBe(202);
    expect(response.headers.get("retry-after")).toBe("30");
    await expect(response.json()).resolves.toMatchObject({
      jobIds: ["job-1"],
      idempotency: {
        outcome: "reconciliation_pending",
        keyAction: "retain",
      },
    });
    expect(mocks.completeSocialKitRequest).not.toHaveBeenCalled();
  });

  it("retains the durable request when a child rejection still needs ledger reconciliation", async () => {
    mocks.orchestrateSocialKit.mockResolvedValue({
      jobIds: ["job-1"],
      totalCost: 8,
      completedJobs: 1,
      sceneCount: 1,
      hasVideo: false,
      submissionStates: { "job-1": "accepted" },
      reconciliationPending: true,
      warnings: ["Video: submission failed"],
    });

    const response = await POST(request());

    expect(response.status).toBe(202);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(mocks.completeSocialKitRequest).not.toHaveBeenCalled();
  });

  it("stores insufficient credit as a stable 402 replay result", async () => {
    mocks.orchestrateSocialKit.mockRejectedValue(
      new CreditError("Insufficient credits", "INSUFFICIENT")
    );

    const response = await POST(request());
    expect(response.status).toBe(402);
    expect(mocks.completeSocialKitRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        responseStatus: 402,
        responseBody: expect.objectContaining({ error: "insufficient_credits" }),
      })
    );
  });

  it("retains the key and leaves the request processing after an ambiguous orchestration failure", async () => {
    mocks.orchestrateSocialKit.mockRejectedValue(new Error("provider timeout"));

    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      requestId: "request-1",
      idempotency: { outcome: "indeterminate", keyAction: "retain" },
    });
    expect(mocks.completeSocialKitRequest).not.toHaveBeenCalled();
  });

  it("returns an indeterminate response when durable completion is not confirmed", async () => {
    mocks.completeSocialKitRequest.mockRejectedValue(
      new Error("response was not persisted")
    );

    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      requestId: "request-1",
      idempotency: { outcome: "indeterminate", keyAction: "retain" },
    });
  });

  it("stores Retry-After so a replay preserves the original header", async () => {
    mocks.rateLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 17_000,
    });

    const original = await POST(request());
    const originalBody = await original.json();
    const completion = mocks.completeSocialKitRequest.mock.calls[0]?.[0];
    expect(original.status).toBe(429);
    expect(completion.responseHeaders).toEqual({
      "Retry-After": original.headers.get("retry-after"),
    });

    mocks.claimSocialKitRequest.mockResolvedValue({
      disposition: "replay",
      requestId: "request-1",
      responseStatus: 429,
      responseBody: originalBody,
      responseHeaders: completion.responseHeaders,
    });

    const replay = await POST(request());
    expect(replay.status).toBe(429);
    expect(replay.headers.get("retry-after")).toBe(
      original.headers.get("retry-after")
    );
  });
});
