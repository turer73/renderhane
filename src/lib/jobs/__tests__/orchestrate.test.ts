import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MODELS,
  SOCIAL_KIT_SCENE_COUNT,
  SOCIAL_KIT_SCENE_MODEL,
  SOCIAL_KIT_VIDEO_MODEL,
  TOOL_CREDITS,
} from "@/lib/fal/models";

const mocks = vi.hoisted(() => ({
  submitJob: vi.fn(),
  reserveSocialKitRequestBundle: vi.fn(),
  getUserById: vi.fn(),
  isAdmin: vi.fn(),
  autoCreateProject: vi.fn(),
}));

vi.mock("@/lib/jobs/submit", () => ({ submitJob: mocks.submitJob }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: mocks.getUserById } },
  }),
}));
vi.mock("@/lib/auth/admin-check", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/jobs/social-kit-idempotency", () => ({
  reserveSocialKitRequestBundle: mocks.reserveSocialKitRequestBundle,
}));
vi.mock("@/lib/jobs/api-helpers", () => ({
  autoCreateProject: mocks.autoCreateProject,
}));

import { orchestrateSocialKit } from "../orchestrate";

describe("orchestrateSocialKit", () => {
  const transactionIds = Array.from(
    { length: SOCIAL_KIT_SCENE_COUNT + 1 },
    (_, index) => `tx-${index + 1}`
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserById.mockResolvedValue({
      data: { user: { email: "user@example.com" } },
    });
    mocks.isAdmin.mockReturnValue(false);
    mocks.reserveSocialKitRequestBundle.mockResolvedValue(transactionIds);
    mocks.autoCreateProject.mockResolvedValue("project-auto");
    mocks.submitJob.mockImplementation(async (input) => ({
      jobId: `job-${mocks.submitJob.mock.calls.length}`,
      requestId: `request-${mocks.submitJob.mock.calls.length}`,
      creditCost:
        input.tool === "scene"
          ? MODELS[SOCIAL_KIT_SCENE_MODEL].creditCost
          : MODELS[SOCIAL_KIT_VIDEO_MODEL].creditCost,
      estimatedTime: "~1min",
      submissionState: "accepted",
    }));
  });

  it("reserves the complete 67-credit bundle before submitting child jobs", async () => {
    const result = await orchestrateSocialKit({
      userId: "user-1",
      requestId: "request-1",
      projectId: "project-1",
      imageUrl: "https://cdn.example/product.png",
      locale: "tr",
    });

    expect(mocks.reserveSocialKitRequestBundle).toHaveBeenCalledOnce();
    const { items } = mocks.reserveSocialKitRequestBundle.mock.calls[0][0];
    expect(items.map((item: { amount: number }) => item.amount)).toEqual([
      ...Array(SOCIAL_KIT_SCENE_COUNT).fill(
        MODELS[SOCIAL_KIT_SCENE_MODEL].creditCost
      ),
      MODELS[SOCIAL_KIT_VIDEO_MODEL].creditCost,
    ]);
    expect(
      items.reduce(
        (total: number, item: { amount: number }) => total + item.amount,
        0
      )
    ).toBe(TOOL_CREDITS["social-kit"]);
    expect(mocks.submitJob).toHaveBeenCalledTimes(SOCIAL_KIT_SCENE_COUNT + 1);

    const childInputs = mocks.submitJob.mock.calls.map(([input]) => input);
    expect(childInputs.every((input) => input.projectId === "project-1")).toBe(true);
    expect(childInputs.map((input) => input.reservedCredit.txId)).toEqual(
      transactionIds
    );
    expect(childInputs.at(-1)?.modelKey).toBe(SOCIAL_KIT_VIDEO_MODEL);
    expect(result).toMatchObject({
      totalCost: TOOL_CREDITS["social-kit"],
      sceneCount: SOCIAL_KIT_SCENE_COUNT,
      hasVideo: true,
      completedJobs: SOCIAL_KIT_SCENE_COUNT + 1,
    });
  });

  it("does not start any provider job when the atomic reservation fails", async () => {
    mocks.reserveSocialKitRequestBundle.mockRejectedValue(
      Object.assign(new Error("Insufficient credits"), {
        name: "CreditError",
        code: "INSUFFICIENT",
      })
    );

    await expect(
      orchestrateSocialKit({
        userId: "user-1",
        requestId: "request-1",
        imageUrl: "https://cdn.example/product.png",
      })
    ).rejects.toThrow("Insufficient credits");
    expect(mocks.submitJob).not.toHaveBeenCalled();
    expect(mocks.autoCreateProject).not.toHaveBeenCalled();
  });

  it("binds one durable request reservation before auto-creating a project", async () => {
    const result = await orchestrateSocialKit({
      userId: "user-1",
      requestId: "request-1",
      imageUrl: "https://cdn.example/product.png",
    });

    expect(mocks.reserveSocialKitRequestBundle).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "request-1", userId: "user-1" })
    );
    expect(
      mocks.reserveSocialKitRequestBundle.mock.invocationCallOrder[0]
    ).toBeLessThan(mocks.autoCreateProject.mock.invocationCallOrder[0]);
    expect(
      mocks.submitJob.mock.calls.every(
        ([input]) =>
          input.projectId === "project-auto" &&
          input.orchestrationRequestId === "request-1"
      )
    ).toBe(true);
    expect(result.completedJobs).toBe(SOCIAL_KIT_SCENE_COUNT + 1);
  });

  it("skips reservations for an allowlisted admin", async () => {
    mocks.isAdmin.mockReturnValue(true);

    const result = await orchestrateSocialKit({
      userId: "admin-1",
      requestId: "request-admin",
      imageUrl: "https://cdn.example/product.png",
      locale: "en",
    });

    expect(mocks.reserveSocialKitRequestBundle).not.toHaveBeenCalled();
    expect(
      mocks.submitJob.mock.calls.every(([input]) => input.reservedCredit === undefined)
    ).toBe(true);
    expect(result.completedJobs).toBe(SOCIAL_KIT_SCENE_COUNT + 1);
  });

  it("reports a partial package without guessing a second refund", async () => {
    mocks.submitJob.mockImplementation(async (input) => {
      if (input.tool === "video") throw new Error("video unavailable");
      return {
        jobId: `job-${mocks.submitJob.mock.calls.length}`,
        requestId: "request-scene",
        creditCost: MODELS[SOCIAL_KIT_SCENE_MODEL].creditCost,
        estimatedTime: "~10s",
        submissionState: "accepted",
      };
    });

    const result = await orchestrateSocialKit({
      userId: "user-1",
      requestId: "request-1",
      imageUrl: "https://cdn.example/product.png",
    });

    expect(result).toMatchObject({
      totalCost:
        SOCIAL_KIT_SCENE_COUNT * MODELS[SOCIAL_KIT_SCENE_MODEL].creditCost,
      sceneCount: SOCIAL_KIT_SCENE_COUNT,
      hasVideo: false,
      completedJobs: SOCIAL_KIT_SCENE_COUNT,
      reconciliationPending: true,
    });
    expect(result.warnings).toContain("Video: video unavailable");
  });

  it("fails closed before reservations when a durable request is missing at runtime", async () => {
    await expect(
      orchestrateSocialKit({
        userId: "user-1",
        imageUrl: "https://cdn.example/product.png",
      } as Parameters<typeof orchestrateSocialKit>[0])
    ).rejects.toThrow("social_kit_durable_request_required");

    expect(mocks.reserveSocialKitRequestBundle).not.toHaveBeenCalled();
    expect(mocks.submitJob).not.toHaveBeenCalled();
  });

  it("returns an indeterminate child job for webhook or cron reconciliation", async () => {
    mocks.submitJob.mockImplementation(async (input) => ({
      jobId: `job-${mocks.submitJob.mock.calls.length}`,
      requestId: null,
      creditCost:
        input.tool === "scene"
          ? MODELS[SOCIAL_KIT_SCENE_MODEL].creditCost
          : MODELS[SOCIAL_KIT_VIDEO_MODEL].creditCost,
      estimatedTime: "~1min",
      submissionState:
        input.tool === "video" ? "indeterminate" : "accepted",
      ...(input.tool === "video"
        ? { warning: "provider_submission_outcome_indeterminate" }
        : {}),
    }));

    const result = await orchestrateSocialKit({
      userId: "user-1",
      requestId: "request-1",
      imageUrl: "https://cdn.example/product.png",
    });

    const videoJobId = result.jobIds.at(-1)!;
    expect(result.submissionStates?.[videoJobId]).toBe("indeterminate");
    expect(result.warnings).toContain(
      "Video: provider_submission_outcome_indeterminate"
    );
    expect(result.completedJobs).toBe(SOCIAL_KIT_SCENE_COUNT + 1);
  });
});
