import { describe, it, expect } from "vitest";
import {
  parseSRT,
  parseSrtTimestamp,
  normalizeSrtText,
  srtToPlainText,
  estimateSrtCredits,
  MAX_SRT_CHARS,
} from "../srt";

const SAMPLE = `1
00:00:01,000 --> 00:00:03,500
Merhaba, hoş geldiniz.

2
00:00:04,000 --> 00:00:06,000
Bu ikinci <i>cümle</i>.
`;

describe("parseSrtTimestamp", () => {
  it("parses comma and dot separators", () => {
    expect(parseSrtTimestamp("00:00:01,000")).toBe(1000);
    expect(parseSrtTimestamp("00:01:02.500")).toBe(62500);
  });

  it("rejects invalid timestamps", () => {
    expect(() => parseSrtTimestamp("00:99:01,000")).toThrow();
    expect(() => parseSrtTimestamp("not-a-time")).toThrow();
  });
});

describe("parseSRT", () => {
  it("parses cues with text cleanup", () => {
    const cues = parseSRT(SAMPLE);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({
      index: 1,
      startMs: 1000,
      endMs: 3500,
      text: "Merhaba, hoş geldiniz.",
    });
    expect(cues[1].text).toBe("Bu ikinci cümle.");
  });

  it("handles BOM + CRLF + dot separator", () => {
    const raw = "﻿1\r\n00:00:01.000 --> 00:00:02.000\r\nSelam\r\n";
    expect(parseSRT(raw)).toHaveLength(1);
  });

  it("rejects empty content", () => {
    expect(() => parseSRT("   ")).toThrow("empty");
  });

  it("rejects end-before-start", () => {
    const raw = "1\n00:00:03,000 --> 00:00:01,000\nSelam\n";
    expect(() => parseSRT(raw)).toThrow("end must be after start");
  });

  it("rejects overlapping cues", () => {
    const raw = [
      "1",
      "00:00:01,000 --> 00:00:03,000",
      "Bir",
      "",
      "2",
      "00:00:02,500 --> 00:00:04,000",
      "İki",
      "",
    ].join("\n");
    expect(() => parseSRT(raw)).toThrow("Overlapping");
  });

  it("rejects over-limit total chars", () => {
    const longText = "a".repeat(MAX_SRT_CHARS + 1);
    const raw = `1\n00:00:01,000 --> 00:00:05,000\n${longText}\n`;
    expect(() => parseSRT(raw)).toThrow();
  });

  it("sorts by time and renumbers", () => {
    const raw = [
      "9",
      "00:00:05,000 --> 00:00:06,000",
      "İkinci",
      "",
      "3",
      "00:00:01,000 --> 00:00:02,000",
      "Birinci",
      "",
    ].join("\n");
    const cues = parseSRT(raw);
    expect(cues[0].text).toBe("Birinci");
    expect(cues[0].index).toBe(1);
    expect(cues[1].index).toBe(2);
  });
});

describe("helpers", () => {
  it("normalizeSrtText strips tags and collapses spaces", () => {
    expect(normalizeSrtText("  Merhaba   <b>dünya</b>{an8} ")).toBe(
      "Merhaba dünya"
    );
  });

  it("srtToPlainText joins cues", () => {
    expect(srtToPlainText(parseSRT(SAMPLE))).toBe(
      "Merhaba, hoş geldiniz. Bu ikinci cümle."
    );
  });

  it("estimateSrtCredits scales with length", () => {
    expect(estimateSrtCredits(100)).toBe(4);
    expect(estimateSrtCredits(500)).toBe(4);
    expect(estimateSrtCredits(1500)).toBe(6);
  });
});
