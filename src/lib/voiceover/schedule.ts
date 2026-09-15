/**
 * SRT Seslendirme — zaman çizelgesi. Saf fonksiyonlar (ağ/DB yok).
 *
 * Kural: ses ASLA kesilmez. Cue sesi slotundan uzunsa taşar ve
 * `overflow: true` işaretlenir (UI'da uyarı + needs_review). Sessizlikler
 * slot başlangıçlarına göre dizilir; mix istemcide WebAudio ile kurulur.
 */

export interface CueTiming {
  startMs: number;
  endMs: number;
}

export interface ScheduledCue {
  index: number;
  /** Sesin çalmaya başlayacağı mutlak ofset (cue başlangıcı). */
  offsetMs: number;
  /** fal'dan dönen gerçek ses süresi. */
  durationMs: number;
  /** Slot bitişi (SRT endMs). */
  slotEndMs: number;
  /** Ses slot dışına taşıyor — kesilmedi, sonraki cue ile çakışabilir. */
  overflow: boolean;
}

export interface PlaybackSchedule {
  cues: ScheduledCue[];
  /** Tüm zaman çizelgesinin süresi (en geç bitiş). */
  totalMs: number;
  overflowCount: number;
}

export function buildSchedule(
  timings: CueTiming[],
  durationsMs: number[]
): PlaybackSchedule {
  if (timings.length !== durationsMs.length) {
    throw new Error("Cue/duration count mismatch");
  }
  const cues: ScheduledCue[] = timings.map((t, i) => {
    const durationMs = Math.max(0, Math.round(durationsMs[i]));
    const overflow = t.startMs + durationMs > t.endMs;
    return {
      index: i + 1,
      offsetMs: t.startMs,
      durationMs,
      slotEndMs: t.endMs,
      overflow,
    };
  });
  const totalMs = cues.reduce(
    (max, c) => Math.max(max, c.slotEndMs, c.offsetMs + c.durationMs),
    0
  );
  return {
    cues,
    totalMs,
    overflowCount: cues.filter((c) => c.overflow).length,
  };
}
