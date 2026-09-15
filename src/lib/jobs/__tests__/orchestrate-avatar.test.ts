import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  submitJob: vi.fn(),
}));

vi.mock("@/lib/jobs/submit", () => ({
  submitJob: mocks.submitJob,
}));

vi.mock("@/lib/credits/engine", () => ({
  reserveCredits: vi.fn(),
  refundCredits: vi.fn(),
  confirmSpend: vi.fn(),
  CreditError: class CreditError extends Error {},
}));

vi.mock("@/lib/ai", () => ({
  getAIProvider: () => ({ subscribe: vi.fn(), submit: vi.fn() }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/admin-check", () => ({
  isAdmin: () => false,
}));

vi.mock("@/lib/prompts/compose", () => ({
  composeSmartPrompt: vi.fn(),
}));

import { orchestrateTalkingAvatar } from "../orchestrate";

describe("orchestrateTalkingAvatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.submitJob.mockResolvedValue({
      jobId: "job-1",
      creditCost: 100,
      estimatedTime: "~2min",
    });
  });

  it("forwards voiceId and modelKey to submitJob", async () => {
    const result = await orchestrateTalkingAvatar({
      userId: "user-1",
      imageUrl: "https://cdn.example/avatar.png",
      script: "Merhaba",
      voiceId: "Turkish_Trustworthyman",
      modelKey: "kling-avatar-v2-std",
    });

    expect(mocks.submitJob).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: "talking-avatar",
        voiceId: "Turkish_Trustworthyman",
        modelKey: "kling-avatar-v2-std",
      })
    );
    expect(result.jobId).toBe("job-1");
  });

  it("rejects over-limit scripts before any submit", async () => {
    await expect(
      orchestrateTalkingAvatar({
        userId: "user-1",
        imageUrl: "https://cdn.example/avatar.png",
        script: "x".repeat(151),
      })
    ).rejects.toThrow("Script too long");
    expect(mocks.submitJob).not.toHaveBeenCalled();
  });
});
