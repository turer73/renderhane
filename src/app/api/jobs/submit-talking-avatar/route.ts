import { createClient } from "@/lib/supabase/server";
import { submitJob } from "@/lib/jobs/submit";
import { CreditError } from "@/lib/credits/engine";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { MODELS, MAX_AVATAR_SCRIPT_CHARS } from "@/lib/fal/models";
import { NextRequest, NextResponse } from "next/server";
import { validateImageUrl, autoCreateProject } from "@/lib/jobs/api-helpers";

// TTS (~5s) + video submission — needs extended timeout
export const maxDuration = 60;

// Hardcoded 25 MODELS ile senkron kopmuştu — tek kaynak MODELS.
const AVATAR_CREDITS = MODELS["omnihuman"].creditCost;

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`job-submit-avatar:${user.id}`, RATE_LIMITS.jobSubmit);
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
  const scriptText = typeof script === "string" && script.trim() ? script : undefined;
  const audioUrlText = typeof audioUrl === "string" && audioUrl.trim() ? audioUrl : undefined;

  // Validate avatar image
  const urlError = validateImageUrl(imageUrl);
  if (urlError) {
    return NextResponse.json({ error: urlError }, { status: 400 });
  }

  // Need either script text or audio URL
  if (!scriptText && !audioUrlText) {
    return NextResponse.json(
      { error: "Either script text or audio URL is required" },
      { status: 400 }
    );
  }

  // Avatar videosu SES SÜRESİYLE ücretlendirilir ($0.16/sn) — sınırsız script
  // sınırsız maliyet demek; sabit kredi fiyatı ~10sn varsayımına dayanır.
  if (scriptText && scriptText.length > MAX_AVATAR_SCRIPT_CHARS) {
    return NextResponse.json(
      {
        error: `Script too long (max ${MAX_AVATAR_SCRIPT_CHARS} characters)`,
        errorTr: `Metin çok uzun (en fazla ${MAX_AVATAR_SCRIPT_CHARS} karakter)`,
      },
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
    // Auto-create project
    const resolvedProjectId = await autoCreateProject(
      user.id,
      "talking-avatar",
      imageUrl as string
    );

    // submitJob owns the atomic reserve -> optional TTS -> video ordering.
    const result = await submitJob({
      userId: user.id,
      projectId: resolvedProjectId,
      tool: "talking-avatar",
      imageUrl: imageUrl as string,
      script: scriptText,
      audioUrl: audioUrlText,
      userEmail: user.email,
    });

    const reconciliationPending = result.submissionState !== "accepted";
    return NextResponse.json(result, {
      status: reconciliationPending ? 202 : 200,
      ...(reconciliationPending
        ? { headers: { "Retry-After": "30" } }
        : {}),
    });
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
