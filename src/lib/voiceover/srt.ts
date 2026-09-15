/**
 * SRT voiceover — parse, validation and text helpers (slice 1).
 *
 * Scope: deterministic, no network, no fal.ai calls. Takes raw .srt file
 * content, returns time-ordered cues plus a joined plain text suitable for
 * a single-utterance TTS request. Per-cue audio + ffmpeg timing alignment
 * is slice 2 — this module preserves cue boundaries so that slice can
 * map TTS segments back to timestamps without re-parsing.
 */

export interface SrtCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

/** Hard caps — abuse + cost protection (fal bills per character). */
export const MAX_SRT_CUES = 200;
export const MAX_SRT_CHARS = 5000;
export const MAX_SRT_CUE_CHARS = 500;

/** Base credit cost for the tool card (<=500 chars). Dynamic per-length pricing is slice 2. */
export const SRT_BASE_CREDITS = 4;

const TIMESTAMP_RE =
  /^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/;

export function parseSrtTimestamp(raw: string): number {
  const m = raw.trim().match(TIMESTAMP_RE);
  if (!m) throw new Error(`Invalid SRT timestamp: "${raw}"`);
  const [, hh, mm, ss, ms] = m;
  const hours = Number(hh);
  const mins = Number(mm);
  const secs = Number(ss);
  const millis = Number(ms);
  if (mins > 59 || secs > 59) {
    throw new Error(`Invalid SRT timestamp: "${raw}"`);
  }
  return ((hours * 60 + mins) * 60 + secs) * 1000 + millis;
}

function isTagOpenerAhead(input: string, i: number): boolean {
  // "<" at i starts a tag-like opener when the next char is a letter,
  // "/" or "!" ("<b>", "</i>", "<!--", "<script x").
  if (input[i] !== "<" || i + 1 >= input.length) return false;
  const c = input.charCodeAt(i + 1);
  return (
    (c >= 65 && c <= 90) || // A-Z
    (c >= 97 && c <= 122) || // a-z
    c === 47 || // /
    c === 33 // !
  );
}

/**
 * Strip tag-like segments ("<b>", "</i>", "<!--c-->", "<script x") INCLUDING
 * unterminated openers — a "<tag" fragment must never survive into TTS
 * speech or downstream sinks. A bare "<" before other chars ("a < b") is
 * kept. Plain scanner, no tag-matching regex heuristics.
 */
function stripTagLike(input: string): string {
  let out = "";
  let i = 0;
  while (i < input.length) {
    if (isTagOpenerAhead(input, i)) {
      const end = input.indexOf(">", i + 1);
      i = end === -1 ? input.length : end + 1;
    } else {
      out += input[i];
      i++;
    }
  }
  return out;
}

/** Collapse whitespace, strip SRT styling tags (<i>, <b>, {an8}, …). */
export function normalizeSrtText(text: string): string {
  return stripTagLike(text)
    .replace(/\{[^}]*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSRT(content: string): SrtCue[] {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!normalized.trim()) throw new Error("SRT content is empty");

  const blocks = normalized
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length === 0) throw new Error("SRT content is empty");
  if (blocks.length > MAX_SRT_CUES) {
    throw new Error(`Too many cues (max ${MAX_SRT_CUES})`);
  }

  const cues: SrtCue[] = blocks.map((block, i) => {
    const lines = block.split("\n").map((l) => l.trim());
    if (lines.length < 2) {
      throw new Error(`Invalid SRT block ${i + 1}: missing timestamp line`);
    }
    // First line is usually the numeric index — tolerate missing/wrong numbers.
    const hasIndex = /^\d+$/.test(lines[0]);
    const timeLine = hasIndex ? lines[1] : lines[0];
    const textLines = hasIndex ? lines.slice(2) : lines.slice(1);

    const arrow = timeLine.split("-->");
    if (arrow.length !== 2) {
      throw new Error(`Invalid SRT timestamp line in block ${i + 1}`);
    }
    const startMs = parseSrtTimestamp(arrow[0]);
    const endMs = parseSrtTimestamp(arrow[1]);
    if (endMs <= startMs) {
      throw new Error(`Invalid SRT cue ${i + 1}: end must be after start`);
    }
    const text = normalizeSrtText(textLines.join(" "));
    if (!text) throw new Error(`Invalid SRT cue ${i + 1}: empty text`);
    if (text.length > MAX_SRT_CUE_CHARS) {
      throw new Error(`SRT cue ${i + 1} too long (max ${MAX_SRT_CUE_CHARS} chars)`);
    }
    return {
      index: hasIndex ? Number(lines[0]) : i + 1,
      startMs,
      endMs,
      text,
    };
  });

  // Time-order (lenient on numbering), then check overlaps + total length.
  cues.sort((a, b) => a.startMs - b.startMs);
  for (let i = 1; i < cues.length; i++) {
    if (cues[i].startMs < cues[i - 1].endMs) {
      throw new Error(`Overlapping SRT cues at cue ${i + 1}`);
    }
  }

  const totalChars = cues.reduce((sum, c) => sum + c.text.length, 0);
  if (totalChars > MAX_SRT_CHARS) {
    throw new Error(`SRT text too long (max ${MAX_SRT_CHARS} chars)`);
  }

  return cues.map((c, i) => ({ ...c, index: i + 1 }));
}

/** Joined plain text for single-utterance TTS (slice 1 pipeline). */
export function srtToPlainText(cues: SrtCue[]): string {
  return cues.map((c) => c.text).join(" ").trim();
}

/** v1 credit estimate shown in UI: base 4 up to 500 chars, +2 per extra 1000. */
export function estimateSrtCredits(totalChars: number): number {
  if (totalChars <= 500) return SRT_BASE_CREDITS;
  return SRT_BASE_CREDITS + Math.ceil((totalChars - 500) / 1000) * 2;
}
