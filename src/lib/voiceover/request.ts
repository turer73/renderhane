import { z } from "zod";
import {
  DEFAULT_SRT_EMOTION,
  DEFAULT_SRT_SPEED,
  DEFAULT_SRT_VOICE,
  MAX_SYNC_CHARS,
  MAX_SYNC_CUES,
  SRT_EMOTIONS,
  SRT_VOICES,
} from "./voices";

/**
 * POST /api/jobs/submit-srt-voiceover gövde şeması.
 * Derin SRT parse/limit kontrolü route'ta parseSRT ile yapılır; burada
 * şekil + allowlist + ham boyut üst sınırı (DoS koruması) uygulanır.
 */
export const srtVoiceoverSchema = z.object({
  srt: z.string().min(1).max(20000),
  voiceId: z
    .string()
    .optional()
    .default(DEFAULT_SRT_VOICE)
    .refine((v) => SRT_VOICES.some((voice) => voice.id === v), {
      message: "Unsupported voice",
    }),
  emotion: z.enum(SRT_EMOTIONS).optional().default(DEFAULT_SRT_EMOTION),
  speed: z.number().min(0.5).max(2).optional().default(DEFAULT_SRT_SPEED),
  /** Taşan replikleri slota sığacak hıza oturt (en fazla 1.3x). */
  autoFit: z.boolean().optional().default(true),
  /** TTS motoru: minimax (doğal + sığdırma) veya xAI (ekonomi, sığdırma yok). */
  engine: z.enum(["minimax", "xai"]).optional().default("minimax"),
  /** xAI motorunda kullanılacak ses (minimax'te voiceId geçerli). */
  xaiVoiceId: z.string().optional(),
  /** Üretim modu: single (tek dosya, önerilen) veya cues (replik bazlı hassas). */
  mode: z.enum(["single", "cues"]).optional().default("single"),
});

export type SrtVoiceoverRequest = z.infer<typeof srtVoiceoverSchema>;

export function validateSrtVoiceover(body: unknown) {
  const result = srtVoiceoverSchema.safeParse(body);
  if (!result.success) {
    const error = result.error.issues[0]?.message || "Invalid request body";
    return { valid: false as const, error };
  }
  return { valid: true as const, data: result.data };
}

export { MAX_SYNC_CHARS, MAX_SYNC_CUES };
