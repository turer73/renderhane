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
  reserveCreditBundle: vi.fn(),
  refundCredits: vi.fn(),
  getUserById: vi.fn(),
  isAdmin: vi.fn(),
}));

vi.mock("@/lib/jobs/submit", () => ({ submitJob: mocks.submitJob }));
vi.mock("@/lib/credits/engine", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/credits/engine")>();
  return {
    ...original,
    reserveCreditBundle: mocks.reserveCreditBundle,
    refundCredits: mocks.refundCredits,
  };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: mocks.getUserById } },
  }),
}));
vi.mock("@/lib/auth/admin-check", () => ({ isAdmin: mocks.isAdmin }));

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
    mocks.reserveCreditBundle.mockResolvedValue(transactionIds);
    mocks.refundCredits.mockResolvedValue(undefined);
    mocks.submitJob.mockImplementation(async (input) => ({
      jobId: `job-${mocks.submitJob.mock.calls.length}`,
      requestId: `request-${mocks.submitJob.mock.calls.length}`,
      creditCost:
        input.tool === "scene"
          ? MODELS[SOCIAL_KIT_SCENE_MODEL].creditCost
          : MODELS[SOCIAL_KIT_VIDEO_MODEL].creditCost,
      estimatedTime: "~1min",
    }));
  });

  it("reserves the complete 67-credit bundle before submitting child jobs", async () => {
    const result = await orchestrateSocialKit({
      userId: "user-1",
      projectId: "project-1",
      imageUrl: "https://cdn.example/product.png",
      locale: "tr",
    });

    expect(mocks.reserveCreditBundle).toHaveBeenCalledOnce();
    const [, items] = mocks.reserveCreditBundle.mock.calls[0];
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
    mocks.reserveCreditBundle.mockRejectedValue(
      Object.assign(new Error("Insufficient credits"), {
        name: "CreditError",
        code: "INSUFFICIENT",
      })
    );

    await expect(
      orchestrateSocialKit({
        userId: "user-1",
        imageUrl: "https://cdn.example/product.png",
      })
    ).rejects.toThrow("Insufficient credits");
    expect(mocks.submitJob).not.toHaveBeenCalled();
  });

  it("skips reservations for an allowlisted admin", async () => {
    mocks.isAdmin.mockReturnValue(true);

    const result = await orchestrateSocialKit({
      userId: "admin-1",
      imageUrl: "https://cdn.example/product.png",
      locale: "en",
    });

    expect(mocks.reserveCreditBundle).not.toHaveBeenCalled();
    expect(
      mocks.submitJob.mock.calls.every(([input]) => input.reservedCredit === undefined)
    ).toBe(true);
    expect(result.completedJobs).toBe(SOCIAL_KIT_SCENE_COUNT + 1);
  });

  it("refunds a failed child reservation and reports a partial package", async () => {
    mocks.submitJob.mockImplementation(async (input) => {
      if (input.tool === "video") throw new Error("video unavailable");
      return {
        jobId: `job-${mocks.submitJob.mock.calls.length}`,
        requestId: "request-scene",
        creditCost: MODELS[SOCIAL_KIT_SCENE_MODEL].creditCost,
        estimatedTime: "~10s",
      };
    });

    const result = await orchestrateSocialKit({
      userId: "user-1",
      imageUrl: "https://cdn.example/product.png",
    });

    expect(mocks.refundCredits).toHaveBeenCalledWith(transactionIds.at(-1));
    expect(result).toMatchObject({
      totalCost:
        SOCIAL_KIT_SCENE_COUNT * MODELS[SOCIAL_KIT_SCENE_MODEL].creditCost,
      sceneCount: SOCIAL_KIT_SCENE_COUNT,
      hasVideo: false,
      completedJobs: SOCIAL_KIT_SCENE_COUNT,
    });
    expect(result.warnings).toContain("Video: video unavailable");
  });
});
