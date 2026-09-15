import { describe, it, expect } from "vitest";
import {
  SRT_VOICES,
  DEFAULT_SRT_VOICE,
  buildMinimaxInput,
  clampSpeed,
  fitSpeed,
  isAllowedVoice,
  MAX_SYNC_CHARS,
  MAX_SYNC_CUES,
} from "../voices";
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
