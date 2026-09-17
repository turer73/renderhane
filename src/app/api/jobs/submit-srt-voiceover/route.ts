import { createClient } from "@/lib/supabase/server";
import { CreditError } from "@/lib/credits/engine";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { validateSrtVoiceover } from "@/lib/voiceover/request";
import { parseSRT, estimateSrtCredits } from "@/lib/voiceover/srt";
import { MAX_SYNC_CHARS, MAX_SYNC_CUES } from "@/lib/voiceover/voices";
import { orchestrateSrtVoiceover } from "@/lib/voiceover/orchestrate";

// Per-cue TTS + R2 uploads — repo standardı 60sn (talking-avatar ile aynı).
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`job-submit-srt:${user.id}`, RATE_LIMITS.jobSubmit);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = validateSrtVoiceover(body);
  if (!parsed.valid) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { srt, voiceId, emotion, speed, autoFit, engine, xaiVoiceId, mode } = parsed.data;

  let cues;
  try {
    cues = parseSRT(srt);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid SRT" },
      { status: 400 }
    );
  }

  const totalChars = cues.reduce((sum, c) => sum + c.text.length, 0);
  if (cues.length > MAX_SYNC_CUES || totalChars > MAX_SYNC_CHARS) {
    return NextResponse.json(
      {
        error: `Too long for instant voiceover (max ${MAX_SYNC_CUES} cues / ${MAX_SYNC_CHARS} chars). Split your file.`,
        errorTr: `Anlık seslendirme için çok uzun (en fazla ${MAX_SYNC_CUES} replik / ${MAX_SYNC_CHARS} karakter). Dosyayı bölün.`,
      },
      { status: 400 }
    );
  }

  const creditCost = estimateSrtCredits(totalChars, engine);

  const { data: balance } = await supabase.rpc("get_credit_balance", {
    p_user_id: user.id,
  });
  if (typeof balance === "number" && balance < creditCost) {
    return NextResponse.json({ error: "insufficient_credits" }, { status: 402 });
  }

  try {
    const result = await orchestrateSrtVoiceover({
      userId: user.id,
      userEmail: user.email,
      cues,
      voiceId,
      emotion,
      speed,
      creditCost,
      autoFit,
      engine,
      xaiVoiceId,
      mode,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CreditError && error.code === "INSUFFICIENT") {
      return NextResponse.json({ error: "insufficient_credits" }, { status: 402 });
    }
    const message =
      error instanceof Error ? error.message : "Voiceover failed";
    console.error("SRT voiceover failed:", message, error);
    // DB CHECK (migration 20260915) uygulanmadan 'srt-voiceover'/'audio'
    // insertleri reddedilir — logdan ayırt edilsin diye mesaj korunur.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
