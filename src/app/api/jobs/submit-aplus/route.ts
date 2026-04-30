import { createClient } from "@/lib/supabase/server";
import { submitJob } from "@/lib/jobs/submit";
import { CreditError } from "@/lib/credits/engine";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { validateImageUrl, autoCreateProject } from "@/app/api/jobs/submit/route";
import { APLUS_SCENES, getScenePrompt, APLUS_TOTAL_CREDITS } from "@/lib/fal/aplus-scenes";

// A+ submits 4 parallel jobs — needs extended timeout
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 5 A+ submissions per minute per user
  const rl = await rateLimit(`job-submit-aplus:${user.id}`, RATE_LIMITS.jobSubmit);
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

  // Validate image URL
  const urlError = validateImageUrl(imageUrl);
  if (urlError) {
    return NextResponse.json({ error: urlError }, { status: 400 });
  }

  // Check credits upfront — user needs 32 credits (4 scenes x 8 each)
  const { data: balance } = await supabase.rpc("get_credit_balance", {
    p_user_id: user.id,
  });

  if (typeof balance === "number" && balance < APLUS_TOTAL_CREDITS) {
    return NextResponse.json(
      { error: "insufficient_credits" },
      { status: 402 }
    );
  }

  // Detect user locale from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("locale")
    .eq("id", user.id)
    .single();
  const locale = profile?.locale || "tr";

  // Auto-create project
  let resolvedProjectId = projectId as string | undefined;
  if (!resolvedProjectId) {
    resolvedProjectId = await autoCreateProject(
      user.id,
      "aplus",
      imageUrl as string
    );
  }

  // Submit 4 scenes in parallel — avoids Vercel function timeout
  const results = await Promise.allSettled(
    APLUS_SCENES.map((scene) =>
      submitJob({
        userId: user.id,
        projectId: resolvedProjectId,
        tool: "aplus",
        imageUrl: imageUrl as string,
        prompt: getScenePrompt(scene.id, locale),
      })
    )
  );

  const jobIds: string[] = [];
  const errors: string[] = [];

  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      jobIds.push(r.value.jobId);
    } else {
      const err = r.reason;
      if (err instanceof CreditError && err.code === "INSUFFICIENT") {
        errors.push(`Scene "${APLUS_SCENES[i].id}": insufficient credits`);
      } else {
        errors.push(
          `Scene "${APLUS_SCENES[i].id}": ${err instanceof Error ? err.message : "failed"}`
        );
      }
    }
  });

  // At least one job must succeed
  if (jobIds.length === 0) {
    return NextResponse.json(
      { error: errors[0] || "All scenes failed to submit" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    jobIds,
    totalCost: jobIds.length * 8,
    sceneCount: APLUS_SCENES.length,
    completedScenes: jobIds.length,
    estimatedTime: "~1min",
    ...(errors.length > 0 ? { warnings: errors } : {}),
  });
}
