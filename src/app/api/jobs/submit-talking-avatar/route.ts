import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { submitJob } from "@/lib/jobs/submit";
import { CreditError } from "@/lib/credits/engine";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { validateImageUrl, autoCreateProject } from "@/app/api/jobs/submit/route";

// TTS (~5s) + video submission — needs extended timeout
export const maxDuration = 60;

const AVATAR_CREDITS = 25;

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`job-submit-avatar:${user.id}`, RATE_LIMITS.jobSubmit);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { imageUrl, script, audioUrl } = body;

  // Validate avatar image
  const urlError = validateImageUrl(imageUrl);
  if (urlError) {
    return NextResponse.json({ error: urlError }, { status: 400 });
  }

  // Need either script text or audio URL
  if (!script && !audioUrl) {
    return NextResponse.json(
      { error: "Either script text or audio URL is required" },
      { status: 400 }
    );
  }

  // Check credits upfront
  const { data: balance } = await supabase.rpc("get_credit_balance", {
    p_user_id: user.id,
  });

  if (typeof balance === "number" && balance < AVATAR_CREDITS) {
    return NextResponse.json(
      { error: "insufficient_credits" },
      { status: 402 }
    );
  }

  try {
    let resolvedAudioUrl = audioUrl as string | undefined;

    // Step 1: If user provided text script, generate TTS audio first
    if (script && typeof script === "string" && !resolvedAudioUrl) {
      const ttsResult = await fal.subscribe("fal-ai/f5-tts", {
        input: {
          gen_text: script,
          model_type: "F5-TTS",
          // Default reference audio for voice cloning — neutral English speaker
          ref_audio_url:
            "https://github.com/SWivid/F5-TTS/raw/main/tests/ref_audio/test_en_1_ref_short.wav",
          ref_text: "",
        },
      });

      const ttsOutput = ttsResult.data as { audio_url?: { url?: string } };
      if (ttsOutput.audio_url?.url) {
        resolvedAudioUrl = ttsOutput.audio_url.url;
      } else {
        return NextResponse.json(
          { error: "TTS generation failed — no audio produced" },
          { status: 500 }
        );
      }
    }

    // Auto-create project
    const resolvedProjectId = await autoCreateProject(
      user.id,
      "talking-avatar",
      imageUrl as string
    );

    // Step 2: Submit OmniHuman video job with audio
    const result = await submitJob({
      userId: user.id,
      projectId: resolvedProjectId,
      tool: "talking-avatar",
      imageUrl: imageUrl as string,
      // Pass audio URL via prompt field (will be handled in smart router override)
      prompt: resolvedAudioUrl,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CreditError && error.code === "INSUFFICIENT") {
      return NextResponse.json(
        { error: "insufficient_credits" },
        { status: 402 }
      );
    }

    console.error("Talking avatar submission failed:", error);
    return NextResponse.json(
      { error: "Avatar generation failed. Please try again." },
      { status: 500 }
    );
  }
}
