/**
 * SRT Seslendirme — ses kataloğu ve fal.ai istek kurucu.
 *
 * Ses ID'leri doğrulama durumu:
 * - "Wise_Woman": fal-ai/minimax/speech-02-hd varsayılanı (fal docs) — doğrulandı.
 * - "Turkish_CalmWoman" / "Turkish_Trustworthyman": MiniMax resmi sistem ses
 *   listesi (platform.minimax.io/docs/faq/system-voice-id.md) — MiniMax native.
 *   fal voice_setting'i aynen ilettiği için geçerli olması beklenir; yine de
 *   allowlist dışına çıkılmaz ve cue hatası tüm işi iade ile düşürür.
 */

export interface VoiceOption {
  id: string;
  labelTr: string;
  labelEn: string;
  gender: "female" | "male";
}

export const SRT_VOICES: VoiceOption[] = [
  {
    id: "Turkish_CalmWoman",
    labelTr: "Sakin Kadın (Türkçe)",
    labelEn: "Calm Woman (Turkish)",
    gender: "female",
  },
  {
    id: "Turkish_Trustworthyman",
    labelTr: "Güvenilir Erkek (Türkçe)",
    labelEn: "Trustworthy Man (Turkish)",
    gender: "male",
  },
  {
    id: "Wise_Woman",
    labelTr: "Bilge Kadın (EN yedek)",
    labelEn: "Wise Woman (EN fallback)",
    gender: "female",
  },
];

export const DEFAULT_SRT_VOICE = "Turkish_CalmWoman";

export type SrtEngine = "minimax" | "xai";

export type SrtMode = "single" | "cues";

export const SRT_MODES: { id: SrtMode; labelTr: string; labelEn: string }[] = [
  { id: "single", labelTr: "Tek parça — tek dosya (önerilen)", labelEn: "Single take — one file (recommended)" },
  { id: "cues", labelTr: "Replik bazlı — hassas", labelEn: "Per-cue — precise" },
];

export const SRT_ENGINES: { id: SrtEngine; labelTr: string; labelEn: string }[] = [
  { id: "minimax", labelTr: "MiniMax 2.8 — Doğal", labelEn: "MiniMax 2.8 — Natural" },
  { id: "xai", labelTr: "xAI — Ekonomi (1kr)", labelEn: "xAI — Economy (1cr)" },
];

/** xAI sesleri (şema enum'undan; TR kalitesi replik başına değişebilir). */
export const XAI_VOICES: VoiceOption[] = [
  { id: "eve", labelTr: "Eve (xAI)", labelEn: "Eve (xAI)", gender: "female" },
  { id: "leo", labelTr: "Leo (xAI)", labelEn: "Leo (xAI)", gender: "male" },
  { id: "ara", labelTr: "Ara (xAI)", labelEn: "Ara (xAI)", gender: "female" },
];

export const DEFAULT_XAI_VOICE = "eve";

export function isAllowedXaiVoice(voiceId: string): boolean {
  return XAI_VOICES.some((v) => v.id === voiceId);
}

export const SRT_EMOTIONS = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "fearful",
  "surprised",
] as const;

export type SrtEmotion = (typeof SRT_EMOTIONS)[number];

export const DEFAULT_SRT_EMOTION: SrtEmotion = "neutral";

/** Konuşma hızı — zaman hizalamayı bozmayacak dar bant. */
export const MIN_SRT_SPEED = 0.8;
export const MAX_SRT_SPEED = 1.2;
export const DEFAULT_SRT_SPEED = 1;

/** Otomatik sığdırma: taşan replik en fazla bu hıza çıkarılır.
 *  Üstü doğallığı bozar — o replik taşma olarak işaretlenir, asla kesilmez. */
export const AUTO_FIT_MAX_SPEED = 1.3;
/** Süre slotun bu oranını aşarsa sığdırma devreye girer (ölçüm payı). */
export const AUTO_FIT_THRESHOLD = 1.02;

/** Senkron endpoint üst sınırları — 60sn serverless bütçesine göre
 *  (24 cue değil: 20 cue × ~4sn / 4 paralel ≈ 20sn TTS + R2 yüklemeleri). */
export const MAX_SYNC_CUES = 20;
export const MAX_SYNC_CHARS = 2000;

/** Paralel fal çağrısı — rate-limit + zaman aşımı dengesi. */
export const SRT_TTS_CONCURRENCY = 4;

export function isAllowedVoice(voiceId: string): boolean {
  return SRT_VOICES.some((v) => v.id === voiceId);
}

export function isAllowedEmotion(emotion: string): emotion is SrtEmotion {
  return (SRT_EMOTIONS as readonly string[]).includes(emotion);
}

export function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return DEFAULT_SRT_SPEED;
  // Üst sınır AUTO_FIT_MAX_SPEED: kullanıcı kaydırıcısı 1.2'de biter,
  // otomatik sığdırma 1.3'e kadar çıkar (UI bandı değişmedi).
  return Math.min(AUTO_FIT_MAX_SPEED, Math.max(MIN_SRT_SPEED, speed));
}

/**
 * Taşan replik için hedef hız: ölçülen süre slota sığacak hız.
 * Yalnızca hızlandırır (yavaşlatma yapmaz — kısa ses + sessizlik doğaldır),
 * AUTO_FIT_MAX_SPEED üstünü istemez (doğallık koruması).
 * Slota sığıyorsa null döner (yeniden seslendirme gerekmez).
 */
export function fitSpeed(
  baseSpeed: number,
  durationMs: number,
  slotMs: number
): number | null {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  if (!Number.isFinite(slotMs) || slotMs <= 0) return null;
  if (durationMs <= slotMs * AUTO_FIT_THRESHOLD) return null;
  const needed = baseSpeed * (durationMs / slotMs);
  if (needed <= baseSpeed * AUTO_FIT_THRESHOLD) return null;
  return Math.min(AUTO_FIT_MAX_SPEED, Math.round(needed * 100) / 100);
}

export interface MinimaxVoiceSetting {
  voice_id: string;
  speed: number;
  emotion: SrtEmotion;
}

/**
 * Tek-parça TTS metni: replikleri SRT boşluklarına göre duraklama
 * işaretleriyle birleştirir. MiniMax "<#saniye#>" anlar (0.01–99.99);
 * xAI'de sade boşluk bırakılır (süre kontrolü yok).
 * gapsMs verilirse her replik öncesi o boşluk kullanılır (süre oturtma).
 */
export function buildSinglePassText(
  cues: { startMs: number; endMs: number; text: string }[],
  engine: SrtEngine = "minimax",
  gapsMs?: number[]
): string {
  return cues
    .map((cue, i) => {
      if (i === 0) return cue.text;
      if (engine === "xai") return cue.text;
      const gapMs = gapsMs?.[i] ?? cue.startMs - cues[i - 1].endMs;
      const gapSec = Math.min(99.99, Math.max(0.05, gapMs / 1000));
      return `<#${gapSec.toFixed(2)}#> ${cue.text}`;
    })
    .join(" ");
}

/** Replik öncesi boşluklar (ms). İlk replik 0. Negatif boşluk 0'a kırpılır. */
export function cueGapMs(cues: { startMs: number; endMs: number }[]): number[] {
  return cues.map((cue, i) =>
    i === 0 ? 0 : Math.max(0, cue.startMs - cues[i - 1].endMs)
  );
}

/**
 * Süre oturtma planı: ölçülen ses süresi (durMs) ile hedef SRT süresi
 * (targetMs) arasındaki farkı kapatmak için boşluk ölçeği ve/veya hız önerir.
 * En fazla 1 düzeltme geçişi varsayar. Döner: { gapsMs, speed } |
 * null (zaten toleransta).
 */
export function planDurationFit(
  gapsMs: number[],
  durMs: number,
  targetMs: number,
  baseSpeed: number
): { gapsMs: number[]; speed: number } | null {
  if (!Number.isFinite(durMs) || durMs <= 0) return null;
  if (!Number.isFinite(targetMs) || targetMs <= 0) return null;
  const tolerance = Math.max(1000, targetMs * 0.05);
  const deficit = targetMs - durMs;
  if (Math.abs(deficit) <= tolerance) return null;

  if (deficit > 0) {
    // Ses kısa: boşlukları orantılı büyüt (konuşma hızına dokunma).
    const totalGaps = gapsMs.reduce((s, g) => s + g, 0);
    if (totalGaps >= 1000) {
      const scale = (totalGaps + deficit) / totalGaps;
      return {
        gapsMs: gapsMs.map((g) => Math.min(99990, Math.round(g * scale))),
        speed: baseSpeed,
      };
    }
    // Büyütülecek boşluk yok: kontrollü yavaşlat (en fazla 0.85x).
    const slowed = Math.max(0.85, (baseSpeed * durMs) / targetMs);
    if (slowed < baseSpeed * 0.999) return { gapsMs, speed: Math.round(slowed * 100) / 100 };
    return null;
  }

  // Ses uzun: hızlandır (en fazla 1.3x) + boşlukları tabana çek.
  const faster = Math.min(AUTO_FIT_MAX_SPEED, (baseSpeed * durMs) / targetMs);
  if (faster > baseSpeed * 1.001) {
    const rounded = Math.round(faster * 100) / 100;
    // Hız tavana vurup yine uzun kalıyorsa boşlukları da orantılı kısalt.
    const atSpeed = (durMs * baseSpeed) / faster;
    const totalGaps = gapsMs.reduce((s, g) => s + g, 0);
    if (atSpeed - targetMs > tolerance && totalGaps > 0) {
      const scale = Math.max(0, (totalGaps - (atSpeed - targetMs)) / totalGaps);
      return {
        gapsMs: gapsMs.map((g, i) => (i === 0 ? 0 : Math.max(50, Math.round(g * scale)))),
        speed: rounded,
      };
    }
    return { gapsMs, speed: rounded };
  }
  return { gapsMs: gapsMs.map(() => 50), speed: faster };
}
export function buildXaiInput(
  text: string,
  opts: { voiceId: string }
): Record<string, unknown> {
  if (!isAllowedXaiVoice(opts.voiceId)) {
    throw new Error(`Unsupported xAI voice: "${opts.voiceId}"`);
  }
  return {
    text,
    voice: opts.voiceId,
    language: "tr",
  };
}
export function buildMinimaxInput(
  text: string,
  opts: { voiceId: string; emotion?: string; speed?: number },
  textKey = "prompt"
): Record<string, unknown> {
  if (!isAllowedVoice(opts.voiceId)) {
    throw new Error(`Unsupported voice: "${opts.voiceId}"`);
  }
  const emotion =
    opts.emotion && isAllowedEmotion(opts.emotion)
      ? opts.emotion
      : DEFAULT_SRT_EMOTION;
  return {
    [textKey]: text,
    voice_setting: {
      voice_id: opts.voiceId,
      speed: clampSpeed(opts.speed ?? DEFAULT_SRT_SPEED),
      emotion,
    } satisfies MinimaxVoiceSetting,
  };
}
