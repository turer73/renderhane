import { createClient } from "@/lib/supabase/server";
import { submitJob } from "@/lib/jobs/submit";
import { CreditError } from "@/lib/credits/engine";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import type { ToolType, ModelTier } from "@/lib/fal/models";
import { validateJobSubmit } from "@/lib/validations/job-submit";
import { autoCreateProject } from "@/lib/jobs/api-helpers";

// Job submission can include auto bg-remove (~5s) + fal.ai queue submit
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 10 job submissions per minute per user
  const rl = await rateLimit(`job-submit:${user.id}`, RATE_LIMITS.jobSubmit);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = validateJobSubmit(body);
  if (!parsed.valid) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { tool, tier, modelKey, imageUrl, imageUrls, projectId, prompt, autoEnhance, skipBgRemove, extraParams } = parsed.data;

  // Resolve or auto-create a project for this job
  const thumbnailUrl = imageUrl ?? imageUrls?.[0] ?? "";
  let resolvedProjectId = projectId as string | undefined;
  if (!resolvedProjectId) {
    resolvedProjectId = await autoCreateProject(
      user.id,
      tool as ToolType,
      thumbnailUrl
    );
  }

  try {
    const result = await submitJob({
      userId: user.id,
      projectId: resolvedProjectId,
      tool: tool as ToolType,
      tier: tier as ModelTier | undefined,
      modelKey,
      imageUrl,
      imageUrls,
      prompt,
      autoEnhance: autoEnhance === true,
      skipBgRemove: skipBgRemove === true,
      extraParams: extraParams as Record<string, unknown> | undefined,
      userEmail: user.email,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CreditError && error.code === "INSUFFICIENT") {
      return NextResponse.json(
        { error: "insufficient_credits" },
        { status: 402 }
      );
    }

    // Log detailed error server-side
    const internalMessage =
      error instanceof Error ? error.message : "Job submission failed";
    console.error("Job submission failed:", internalMessage, error);

    // Return a hint about the failure category (safe — no secrets exposed)
    let errorHint = "Job submission failed. Please try again.";
    if (internalMessage.includes("FAL_WEBHOOK_SECRET")) {
      errorHint = "Server configuration error (webhook). Contact support.";
    } else if (internalMessage.includes("FAL_KEY") || internalMessage.includes("fal")) {
      errorHint = "AI service connection error. Please try again later.";
    } else if (internalMessage.includes("SUPABASE") || internalMessage.includes("Missing")) {
      errorHint = "Database configuration error. Contact support.";
    } else if (internalMessage.includes("Failed to create job")) {
      errorHint = "Database write error. Please try again.";
    }

    return NextResponse.json(
      { error: errorHint },
      { status: 500 }
    );
  }
}
