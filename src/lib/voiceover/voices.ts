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
 * xAI TTS isteği. Çıktı {audio:{url}} (duration_ms YOK).
 */
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
