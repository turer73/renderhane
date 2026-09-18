import { describe, it, expect } from "vitest";
import {
  SRT_VOICES,
  XAI_VOICES,
  DEFAULT_SRT_VOICE,
  DEFAULT_XAI_VOICE,
  buildMinimaxInput,
  buildSinglePassText,
  buildXaiInput,
  clampSpeed,
  cueGapMs,
  fitSpeed,
  isAllowedVoice,
  isAllowedXaiVoice,
  planDurationFit,
  MAX_SYNC_CHARS,
  MAX_SYNC_CUES,
} from "../voices";
import { estimateSrtCredits } from "../srt";
import { buildSchedule } from "../schedule";
import { validateSrtVoiceover } from "../request";

describe("voices", () => {
  it("default voice is a Turkish system voice in the allowlist", () => {
    expect(DEFAULT_SRT_VOICE).toBe("Turkish_CalmWoman");
    expect(isAllowedVoice(DEFAULT_SRT_VOICE)).toBe(true);
    expect(SRT_VOICES).toHaveLength(3);
  });

  it("builds a fal minimax input with voice_setting (2.8 prompt key)", () => {
    const input = buildMinimaxInput("Merhaba", {
      voiceId: "Turkish_Trustworthyman",
      emotion: "happy",
      speed: 1.1,
    });
    expect(input.prompt).toBe("Merhaba");
    expect(input.voice_setting).toMatchObject({
      voice_id: "Turkish_Trustworthyman",
      speed: 1.1,
      emotion: "happy",
    });
    const legacy = buildMinimaxInput("Selam", { voiceId: DEFAULT_SRT_VOICE }, "text");
    expect(legacy.text).toBe("Selam");
  });

  it("rejects unknown voices and falls back to neutral emotion", () => {
    expect(() => buildMinimaxInput("x", { voiceId: "Nope" })).toThrow(
      "Unsupported voice"
    );
    const input = buildMinimaxInput("x", {
      voiceId: DEFAULT_SRT_VOICE,
      emotion: "confused",
    });
    expect(
      (input.voice_setting as { emotion: string }).emotion
    ).toBe("neutral");
  });

  it("clamps speed to the timing-safe band (fit may reach 1.3)", () => {
    expect(clampSpeed(5)).toBe(1.3);
    expect(clampSpeed(0.1)).toBe(0.8);
    expect(clampSpeed(Number.NaN)).toBe(1);
  });

  it("sync caps fit the 60s serverless budget", () => {
    expect(MAX_SYNC_CUES).toBe(20);
    expect(MAX_SYNC_CHARS).toBe(2000);
  });

  it("xAI economy estimator starts at 1 credit", () => {
    expect(estimateSrtCredits(500, "xai")).toBe(1);
    expect(estimateSrtCredits(1000, "xai")).toBe(1);
    expect(estimateSrtCredits(3000, "xai")).toBe(2);
    expect(estimateSrtCredits(500)).toBe(4);
  });

  it("buildSinglePassText joins cues with gap pauses (minimax)", () => {
    const text = buildSinglePassText([
      { startMs: 1000, endMs: 3000, text: "Merhaba." },
      { startMs: 4500, endMs: 6000, text: "Hoş geldin." },
    ]);
    expect(text).toBe("Merhaba. <#1.50#> Hoş geldin.");
  });

  it("buildSinglePassText clamps tiny gaps and plain-joins xAI", () => {
    const cues = [
      { startMs: 1000, endMs: 3000, text: "Bir." },
      { startMs: 3050, endMs: 5000, text: "İki." },
    ];
    expect(buildSinglePassText(cues)).toBe("Bir. <#0.05#> İki.");
    expect(buildSinglePassText(cues, "xai")).toBe("Bir. İki.");
  });

  it("cueGapMs measures pre-cue gaps, negatives clamped", () => {
    expect(
      cueGapMs([
        { startMs: 1000, endMs: 3000 },
        { startMs: 4500, endMs: 6000 },
        { startMs: 5900, endMs: 7000 },
      ])
    ).toEqual([0, 1500, 0]);
  });

  it("planDurationFit scales gaps when audio is short", () => {
    const plan = planDurationFit([0, 1500, 500], 30000, 47000, 1);
    expect(plan).not.toBe(null);
    // 2000ms gaps + 17000 deficit → 9.5x
    expect(plan?.gapsMs).toEqual([0, 14250, 4750]);
    expect(plan?.speed).toBe(1);
  });

  it("planDurationFit slows down when no gaps to grow", () => {
    const plan = planDurationFit([0, 0], 30000, 47000, 1);
    expect(plan?.speed).toBeCloseTo(0.85, 5);
  });

  it("planDurationFit speeds up when audio is long, capped at 1.3", () => {
    expect(planDurationFit([0, 500], 70000, 47000, 1)?.speed).toBe(1.3);
    expect(planDurationFit([0, 500], 50000, 47000, 1)?.speed).toBeCloseTo(1.06, 1);
  });

  it("planDurationFit shrinks gaps when speed cap is not enough", () => {
    const plan = planDurationFit([0, 500], 70000, 47000, 1);
    expect(plan?.speed).toBe(1.3);
    expect(plan?.gapsMs).toEqual([0, 50]);
  });

  it("planDurationFit returns null inside tolerance or without data", () => {
    expect(planDurationFit([0, 500], 46500, 47000, 1)).toBe(null);
    expect(planDurationFit([0, 500], 0, 47000, 1)).toBe(null);
  });

  it("xAI input pins Turkish + allowlisted voice", () => {
    expect(DEFAULT_XAI_VOICE).toBe("eve");
    expect(isAllowedXaiVoice("eve")).toBe(true);
    expect(isAllowedXaiVoice("Wise_Woman")).toBe(false);
    expect(XAI_VOICES).toHaveLength(3);
    expect(buildXaiInput("Selam", { voiceId: "leo" })).toMatchObject({
      text: "Selam",
      voice: "leo",
      language: "tr",
    });
    expect(() => buildXaiInput("x", { voiceId: "Nope" })).toThrow("Unsupported xAI voice");
  });

  it("fitSpeed only speeds up overflowing cues, capped at 1.3", () => {
    expect(fitSpeed(1, 1500, 3000)).toBe(null); // fits
    expect(fitSpeed(1, 3050, 3000)).toBe(null); // within threshold
    expect(fitSpeed(1, 3600, 3000)).toBe(1.2); // 1.2x needed
    expect(fitSpeed(1, 6000, 3000)).toBe(1.3); // capped, still overflows
    expect(fitSpeed(1, 0, 3000)).toBe(null); // unknown duration
    expect(fitSpeed(1, 3000, 0)).toBe(null); // invalid slot
  });
});

describe("schedule", () => {
  it("offsets cues at slot starts and flags overflow without cutting", () => {
    const schedule = buildSchedule(
      [
        { startMs: 1000, endMs: 3000 },
        { startMs: 4000, endMs: 5000 },
      ],
      [1500, 2500]
    );
    expect(schedule.cues[0]).toMatchObject({
      offsetMs: 1000,
      durationMs: 1500,
      overflow: false,
    });
    expect(schedule.cues[1].overflow).toBe(true);
    expect(schedule.overflowCount).toBe(1);
    expect(schedule.totalMs).toBe(6500);
  });

  it("rejects count mismatch", () => {
    expect(() =>
      buildSchedule([{ startMs: 0, endMs: 100 }], [])
    ).toThrow("mismatch");
  });
});

describe("request validation", () => {
  it("accepts engine + xaiVoiceId", () => {
    const result = validateSrtVoiceover({
      srt: "1\n00:00:01,000 --> 00:00:02,000\nSelam\n",
      engine: "xai",
      xaiVoiceId: "leo",
      autoFit: false,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects unknown engine", () => {
    expect(
      validateSrtVoiceover({ srt: "x", engine: "other" }).valid
    ).toBe(false);
  });

  it("accepts a minimal body with defaults", () => {
    const result = validateSrtVoiceover({ srt: "1\n00:00:01,000 --> 00:00:02,000\nSelam\n" });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.voiceId).toBe(DEFAULT_SRT_VOICE);
    }
  });

  it("rejects unknown voice, bad emotion and empty srt", () => {
    expect(validateSrtVoiceover({ srt: "", voiceId: "x" }).valid).toBe(false);
    expect(
      validateSrtVoiceover({ srt: "x", emotion: "confused" }).valid
    ).toBe(false);
  });
});
