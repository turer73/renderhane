import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODELS } from "@/lib/fal/models";

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  reserveCredits: vi.fn(),
  refundCredits: vi.fn(),
  subscribe: vi.fn(),
  submit: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/credits/engine", () => ({
  reserveCredits: mocks.reserveCredits,
  refundCredits: mocks.refundCredits,
}));

vi.mock("@/lib/ai", () => ({
  getAIProvider: () => ({
    subscribe: mocks.subscribe,
    submit: mocks.submit,
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/auth/admin-check", () => ({
  isAdmin: () => false,
}));

vi.mock("@/lib/prompts/compose", () => ({
  composeSmartPrompt: vi.fn(),
}));

import { submitJob } from "../submit";

function createSupabaseMock() {
  const insertSingle = vi.fn().mockImplementation(async () => {
    mocks.events.push("job-insert");
    return {
      data: { id: "job-1" },
      error: null,
    };
  });
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn(() => ({
    insert: vi.fn(() => ({
      select: vi.fn(() => ({ single: insertSingle })),
    })),
    update: vi.fn(() => ({ eq: updateEq })),
  }));

  return {
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({
          data: { user: { email: "user@example.com" } },
        }),
      },
    },
    rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    from,
  };
}

describe("submitJob credit ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.events.length = 0;
    process.env.FAL_WEBHOOK_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com";

    mocks.createAdminClient.mockReturnValue(createSupabaseMock());
    mocks.reserveCredits.mockImplementation(async (_userId, amount) => {
      mocks.events.push(`reserve:${amount}`);
      return "tx-1";
    });
    mocks.refundCredits.mockImplementation(async () => {
      mocks.events.push("refund");
    });
    mocks.subscribe.mockImplementation(async (modelId, input) => {
      mocks.events.push(`subscribe:${modelId}`);
      return { data: { image: { url: `${input.image_url}?processed=1` } } };
    });
    mocks.submit.mockImplementation(async () => {
      mocks.events.push("submit");
      return { requestId: "fal-request-1" };
    });
  });

  it("reserves before paid 3D preprocessing and charges enhancement per image", async () => {
    const result = await submitJob({
      userId: "user-1",
      tool: "3d-model",
      imageUrls: ["https://cdn.example/a.png", "https://cdn.example/b.png"],
      autoEnhance: true,
    });

    const expectedCost = MODELS["hunyuan3d-v3"].creditCost + 2 * 4;
    expect(result.creditCost).toBe(expectedCost);
    expect(mocks.events.slice(0, 2)).toEqual([
      "job-insert",
      `reserve:${expectedCost}`,
    ]);
    expect(mocks.events.filter((event) => event.includes("birefnet"))).toHaveLength(2);
    expect(mocks.events.filter((event) => event.includes("aura-sr"))).toHaveLength(2);
    expect(mocks.events.at(-1)).toBe("submit");
  });

  it("reserves before talking-avatar TTS and refunds when TTS has no output", async () => {
    mocks.subscribe.mockImplementationOnce(async (modelId) => {
      mocks.events.push(`subscribe:${modelId}`);
      return { data: {} };
    });

    await expect(
      submitJob({
        userId: "user-1",
        tool: "talking-avatar",
        imageUrl: "https://cdn.example/avatar.png",
        script: "Merhaba",
      })
    ).rejects.toThrow("TTS generation failed");

    expect(mocks.events).toEqual([
      "job-insert",
      `reserve:${MODELS.omnihuman.creditCost}`,
      "subscribe:fal-ai/f5-tts",
      "refund",
    ]);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("uses a pre-reserved bundle transaction without charging twice", async () => {
    const result = await submitJob({
      userId: "user-1",
      tool: "scene",
      modelKey: "bria-product-shot",
      imageUrl: "https://cdn.example/product.png",
      prompt: "Studio product photo",
      reservedCredit: {
        txId: "tx-bundle-scene",
        amount: MODELS["bria-product-shot"].creditCost,
      },
    });

    expect(result.creditCost).toBe(MODELS["bria-product-shot"].creditCost);
    expect(mocks.reserveCredits).not.toHaveBeenCalled();
    expect(mocks.refundCredits).not.toHaveBeenCalled();
    expect(mocks.submit).toHaveBeenCalledOnce();
  });

  it("refunds and rejects a pre-reservation whose amount does not match the model", async () => {
    await expect(
      submitJob({
        userId: "user-1",
        tool: "scene",
        modelKey: "bria-product-shot",
        imageUrl: "https://cdn.example/product.png",
        reservedCredit: { txId: "tx-wrong", amount: 1 },
      })
    ).rejects.toThrow("Reserved credit mismatch");

    expect(mocks.events).toEqual(["refund"]);
    expect(mocks.reserveCredits).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
