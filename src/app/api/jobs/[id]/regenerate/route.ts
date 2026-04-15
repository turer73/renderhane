import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitJob } from "@/lib/jobs/submit";
import { CreditError } from "@/lib/credits/engine";
import { MODELS } from "@/lib/fal/models";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import type { ToolType } from "@/lib/fal/models";

export const maxDuration = 60;

/**
 * POST /api/jobs/:id/regenerate
 * Re-submits a job using the stored original_request (pre-processing params).
 * Falls back to extracting from input_params for legacy jobs without original_request.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit
  const rl = rateLimit(`job-submit:${user.id}`, RATE_LIMITS.jobSubmit);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait." },
      { status: 429 }
    );
  }

  // Fetch original job (include original_request + input_params for fallback)
  const admin = createAdminClient();
  const { data: job, error: fetchErr } = await admin
    .from("jobs")
    .select("id, user_id, tool, model_id, original_request, input_params")
    .eq("id", id)
    .single();

  if (fetchErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tool = job.tool as ToolType;
  const originalReq = (job.original_request ?? {}) as Record<string, unknown>;
  const hasOriginal = Object.keys(originalReq).length > 0;

  let imageUrl: string | undefined;
  let imageUrls: string[] | undefined;
  let prompt: string | undefined;
  let tier: "fast" | "standard" | "premium";

  if (hasOriginal) {
    // ── Primary path: use original_request (pre-processing, reliable URLs) ──
    if (typeof originalReq.imageUrl === "string") imageUrl = originalReq.imageUrl;
    if (Array.isArray(originalReq.imageUrls)) {
      imageUrls = originalReq.imageUrls.filter((u): u is string => typeof u === "string");
    }
    if (typeof originalReq.prompt === "string") prompt = originalReq.prompt;
    tier = (typeof originalReq.tier === "string" ? originalReq.tier : "standard") as "fast" | "standard" | "premium";
  } else {
    // ── Fallback: extract from input_params (legacy jobs without original_request) ──
    const modelId = job.model_id as string;
    const inputParams = (job.input_params ?? {}) as Record<string, unknown>;
    const model = MODELS[modelId];

    if (model) {
      const imgKey = model.imageParamKey;
      const promptKey = model.promptParamKey;

      if (imgKey && imgKey !== "_unused") {
        const imgVal = inputParams[imgKey];
        if (Array.isArray(imgVal)) {
          imageUrls = imgVal.filter((u): u is string => typeof u === "string");
        } else if (typeof imgVal === "string" && imgVal) {
          imageUrl = imgVal;
        }
      }

      // Named multi-image params (e.g. Tripo: front_image_url, left_image_url)
      if (model.namedImageParams) {
        const urls = model.namedImageParams
          .map((key) => inputParams[key])
          .filter((u): u is string => typeof u === "string" && !!u);
        if (urls.length > 0) {
          imageUrls = urls;
          imageUrl = undefined;
        }
      }

      if (promptKey && promptKey !== "_unused") {
        const pVal = inputParams[promptKey];
        if (typeof pVal === "string" && pVal) prompt = pVal;
      }
    }

    tier = reverseLookupTier(modelId);
  }

  try {
    const result = await submitJob({
      userId: user.id,
      tool,
      tier,
      imageUrl,
      imageUrls,
      prompt,
    });

    return NextResponse.json({
      jobId: result.jobId,
      creditCost: result.creditCost,
    });
  } catch (err) {
    if (err instanceof CreditError && err.code === "INSUFFICIENT") {
      return NextResponse.json({ error: "Yetersiz kredi" }, { status: 402 });
    }
    const message =
      err instanceof Error ? err.message : "Yeniden uretim basarisiz";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Best-effort reverse lookup for legacy jobs: model_id → tier */
function reverseLookupTier(modelId: string): "fast" | "standard" | "premium" {
  const FAST = ["triposr", "tripo-v25-mv", "flux-schnell"];
  const PREMIUM = ["hunyuan3d-v31-pro", "flux-pro"];
  if (FAST.includes(modelId)) return "fast";
  if (PREMIUM.includes(modelId)) return "premium";
  return "standard";
}
