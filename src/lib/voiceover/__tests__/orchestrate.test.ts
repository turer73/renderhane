import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reserveCredits: vi.fn(),
  confirmSpend: vi.fn(),
  refundCredits: vi.fn(),
  subscribe: vi.fn(),
  uploadToR2: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/credits/engine", () => ({
  reserveCredits: mocks.reserveCredits,
  confirmSpend: mocks.confirmSpend,
  refundCredits: mocks.refundCredits,
}));

vi.mock("@/lib/ai", () => ({
  getAIProvider: () => ({ subscribe: mocks.subscribe }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/auth/admin-check", () => ({
  isAdmin: () => false,
}));

vi.mock("@/lib/r2/upload", () => ({
  uploadToR2: mocks.uploadToR2,
}));

import { orchestrateSrtVoiceover } from "../orchestrate";

function supabaseMock() {
  return {
    from: (table: string) => {
      if (table === "outputs") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: { id: "job-1" }, error: null }),
          })),
        })),
        update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      };
    },
  };
}

const CUES = [
  { index: 1, startMs: 1000, endMs: 4000, text: "Kısa replik." },
  { index: 2, startMs: 5000, endMs: 8000, text: "Çok uzun bir replik metni buraya geliyor." },
];

describe("orchestrateSrtVoiceover auto-fit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockReturnValue(supabaseMock());
    mocks.reserveCredits.mockResolvedValue("tx-1");
    mocks.uploadToR2.mockImplementation(async (falUrl: string) => ({
      r2Url: `${falUrl}?r2=1`,
      fileSize: 10,
    }));
    // Pass 1: cue1 fits (1.5s < 3s slot), cue2 overflows (6s > 3s slot).
    // Pass 2 (refit at 1.3x): cue2 still 4.5s > 3s → overflow stays, flagged.
    mocks.subscribe
      .mockResolvedValueOnce({ data: { audio: { url: "https://fal.media/a1.mp3" }, duration_ms: 1500 } })
      .mockResolvedValueOnce({ data: { audio: { url: "https://fal.media/a2.mp3" }, duration_ms: 6000 } })
      .mockResolvedValueOnce({ data: { audio: { url: "https://fal.media/a2fast.mp3" }, duration_ms: 4500 } });
  });

  it("re-synthesizes overflowing cues at fitted speed and flags the rest", async () => {
    const result = await orchestrateSrtVoiceover({
      userId: "user-1",
      userEmail: "user@example.com",
      cues: CUES,
      voiceId: "Turkish_CalmWoman",
      emotion: "neutral",
      speed: 1,
      creditCost: 4,
      autoFit: true,
      mode: "cues",
    });

    expect(mocks.subscribe).toHaveBeenCalledTimes(3);
    const refitCall = mocks.subscribe.mock.calls[2];
    expect(refitCall[1]).toMatchObject({
      voice_setting: expect.objectContaining({ speed: 1.3 }),
    });
    expect(result.refitCount).toBe(1);
    expect(result.tracks[0].speed).toBe(1);
    expect(result.tracks[1].speed).toBe(1.3);
    expect(result.tracks[1].url).toContain("a2fast");
    expect(result.overflowCount).toBe(1);
    expect(mocks.confirmSpend).toHaveBeenCalledWith("tx-1", "job-1");
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it("skips the second pass when autoFit is off", async () => {
    const result = await orchestrateSrtVoiceover({
      userId: "user-1",
      userEmail: "user@example.com",
      cues: CUES,
      voiceId: "Turkish_CalmWoman",
      emotion: "neutral",
      speed: 1,
      creditCost: 4,
      autoFit: false,
      mode: "cues",
    });

    expect(mocks.subscribe).toHaveBeenCalledTimes(2);
    expect(result.refitCount).toBe(0);
    expect(result.overflowCount).toBe(1);
  });

  it("single mode makes one TTS call and returns one file", async () => {
    mocks.subscribe.mockReset();
    mocks.subscribe.mockResolvedValue({
      data: { audio: { url: "https://fal.media/full.mp3" }, duration_ms: 9000 },
    });

    const result = await orchestrateSrtVoiceover({
      userId: "user-1",
      userEmail: "user@example.com",
      cues: CUES,
      voiceId: "Turkish_CalmWoman",
      emotion: "neutral",
      speed: 1,
      creditCost: 4,
      autoFit: true,
      mode: "single",
    });

    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe.mock.calls[0][1]).toMatchObject({
      prompt: expect.stringContaining("<#"),
    });
    expect(result.mode).toBe("single");
    expect(result.audioUrl).toContain("fal.media/full.mp3");
    expect(result.audioDurationMs).toBe(9000);
    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[0].url).toBe(result.tracks[1].url);
    expect(result.overflowCount).toBe(0);
    expect(result.refitCount).toBe(0);
  });

  it("single mode fits duration with a second pass", async () => {
    mocks.subscribe.mockReset();
    mocks.subscribe
      .mockResolvedValueOnce({
        data: { audio: { url: "https://fal.media/short.mp3" }, duration_ms: 5000 },
      })
      .mockResolvedValueOnce({
        data: { audio: { url: "https://fal.media/fitted.mp3" }, duration_ms: 7900 },
      });

    const result = await orchestrateSrtVoiceover({
      userId: "user-1",
      userEmail: "user@example.com",
      cues: CUES,
      voiceId: "Turkish_CalmWoman",
      emotion: "neutral",
      speed: 1,
      creditCost: 4,
      autoFit: true,
      mode: "single",
    });

    expect(mocks.subscribe).toHaveBeenCalledTimes(2);
    expect(result.fitPasses).toBe(2);
    expect(result.audioUrl).toContain("fitted");
    expect(result.audioDurationMs).toBe(7900);
  });

  it("refunds when a cue fails", async () => {
    mocks.subscribe.mockReset();
    mocks.subscribe.mockResolvedValueOnce({
      data: { audio: { url: "https://fal.media/a1.mp3" }, duration_ms: 1500 },
    });
    mocks.subscribe.mockRejectedValueOnce(new Error("fal exploded"));

    await expect(
      orchestrateSrtVoiceover({
        userId: "user-1",
        userEmail: "user@example.com",
        cues: CUES,
        voiceId: "Turkish_CalmWoman",
        emotion: "neutral",
        speed: 1,
        creditCost: 4,
        mode: "cues",
        autoFit: true,
      })
    ).rejects.toThrow("Cue 2");
    expect(mocks.refundCredits).toHaveBeenCalledWith("tx-1");
    expect(mocks.confirmSpend).not.toHaveBeenCalled();
  });
});
