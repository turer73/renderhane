import { createClient } from "@/lib/supabase/server";
import { submitJob } from "@/lib/jobs/submit";
import { CreditError } from "@/lib/credits/engine";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { validateImageUrl, autoCreateProject } from "@/app/api/jobs/submit/route";

// Social Kit submits 6 parallel jobs — needs extended timeout
export const maxDuration = 120;

/** Actual credit cost: 4×8 (scenes) + 20 (video) = 52 */
const SOCIAL_KIT_TOTAL_CREDITS = 52;

/** Scene prompts for 4 carousel images */
const SCENE_PROMPTS = {
  tr: [
    "Profesyonel stüdyo ışıklarında, temiz beyaz arka planda e-ticaret ürün fotoğrafı, yüksek çözünürlük",
    "Yaşam tarzı sahnesi, ürün günlük kullanımda, doğal ışık, sıcak tonlar, lifestyle fotoğrafçılık",
    "Üst açıdan flat lay kompozisyon, ürün şık aksesuarlarla çevrili, minimalist düzen, Pinterest tarzı",
    "Mevsimsel tema, trendy arka plan, ürün ön planda, sosyal medya için optimize edilmiş kare format",
  ],
  en: [
    "Professional studio lighting, clean white background, e-commerce product photography, high resolution",
    "Lifestyle scene, product in everyday use, natural lighting, warm tones, lifestyle photography",
    "Top-down flat lay composition, product surrounded by elegant accessories, minimalist layout, Pinterest style",
    "Seasonal theme, trendy background, product in foreground, square format optimized for social media",
  ],
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`job-submit-social:${user.id}`, RATE_LIMITS.jobSubmit);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { imageUrl, projectId } = body;

  const urlError = validateImageUrl(imageUrl);
  if (urlError) {
    return NextResponse.json({ error: urlError }, { status: 400 });
  }

  // Check credits upfront
  const { data: balance } = await supabase.rpc("get_credit_balance", {
    p_user_id: user.id,
  });

  if (typeof balance === "number" && balance < SOCIAL_KIT_TOTAL_CREDITS) {
    return NextResponse.json(
      { error: "insufficient_credits" },
      { status: 402 }
    );
  }

  // Detect locale
  const { data: profile } = await supabase
    .from("profiles")
    .select("locale")
    .eq("id", user.id)
    .single();
  const locale = (profile?.locale || "tr") as "tr" | "en";

  // Auto-create project
  let resolvedProjectId = projectId as string | undefined;
  if (!resolvedProjectId) {
    resolvedProjectId = await autoCreateProject(
      user.id,
      "scene", // Uses scene tool type for project naming
      imageUrl as string
    );
  }

  const prompts = SCENE_PROMPTS[locale] || SCENE_PROMPTS.tr;

  // Step 1: Submit 4 scene variations in parallel
  const sceneResults = await Promise.allSettled(
    prompts.map((scenePrompt) =>
      submitJob({
        userId: user.id,
        projectId: resolvedProjectId,
        tool: "scene",
        imageUrl: imageUrl as string,
        prompt: scenePrompt,
      })
    )
  );

  // Step 2: Submit video generation
  const videoResult = await submitJob({
    userId: user.id,
    projectId: resolvedProjectId,
    tool: "video",
    imageUrl: imageUrl as string,
    prompt: locale === "tr"
      ? "Yumuşak kamera hareketi ile profesyonel ürün tanıtım videosu, stüdyo ışıkları"
      : "Professional product showcase video with smooth camera movement, studio lighting",
  }).catch((err) => ({ error: err }));

  const jobIds: string[] = [];
  const errors: string[] = [];
  let totalCost = 0;

  sceneResults.forEach((r, i) => {
    if (r.status === "fulfilled") {
      jobIds.push(r.value.jobId);
      totalCost += r.value.creditCost;
    } else {
      const err = r.reason;
      if (err instanceof CreditError && err.code === "INSUFFICIENT") {
        errors.push(`Scene ${i + 1}: insufficient credits`);
      } else {
        errors.push(`Scene ${i + 1}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
  });

  if ("jobId" in videoResult) {
    jobIds.push(videoResult.jobId);
    totalCost += videoResult.creditCost;
  } else {
    errors.push(`Video: ${"error" in videoResult && videoResult.error instanceof Error ? videoResult.error.message : "failed"}`);
  }

  if (jobIds.length === 0) {
    return NextResponse.json(
      { error: errors[0] || "All jobs failed to submit" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    jobIds,
    totalCost,
    sceneCount: 4,
    hasVideo: "jobId" in videoResult,
    completedJobs: jobIds.length,
    estimatedTime: "~3min",
    ...(errors.length > 0 ? { warnings: errors } : {}),
  });
}
