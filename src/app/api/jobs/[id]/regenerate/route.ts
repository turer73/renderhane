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
 * Re-submits a job using the original parameters stored in input_params.
 * Extracts imageUrl/prompt from the fal.ai-formatted input using model config.
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

  // Fetch original job
  const admin = createAdminClient();
  const { data: job, error: fetchErr } = await admin
    .from("jobs")
    .select("id, user_id, tool, model_id, input_params")
    .eq("id", id)
    .single();

  if (fetchErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tool = job.tool as ToolType;
  const modelId = job.model_id as string;
  const inputParams = (job.input_params ?? {}) as Record<string, unknown>;

  // Extract original image URL(s) and prompt from stored fal.ai input
  const model = MODELS[modelId];
  let imageUrl: string | undefined;
  let imageUrls: string[] | undefined;
  let prompt: string | undefined;

  if (model) {
    const imgKey = model.imageParamKey;
    const promptKey = model.promptParamKey;

    // Extract image(s)
    if (imgKey && imgKey !== "_unused") {
      const imgVal = inputParams[imgKey];
      if (Array.isArray(imgVal)) {
        imageUrls = imgVal.filter((u): u is string => typeof u === "string");
      } else if (typeof imgVal === "string" && imgVal) {
        imageUrl = imgVal;
      }
    }

    // For named multi-image params (e.g. Tripo: front_image_url, left_image_url, etc.)
    if (model.namedImageParams) {
      const urls = model.namedImageParams
        .map((key) => inputParams[key])
        .filter((u): u is string => typeof u === "string" && !!u);
      if (urls.length > 0) {
        imageUrls = urls;
        imageUrl = undefined; // use imageUrls instead
      }
    }

    // Extract prompt
    if (promptKey && promptKey !== "_unused") {
      const pVal = inputParams[promptKey];
      if (typeof pVal === "string" && pVal) {
        prompt = pVal;
      }
    }
  }

  // Determine tier from model_id (reverse lookup)
  const tier = reverseLookupTier(tool, modelId);

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

/** Best-effort reverse lookup: model_id → tier */
function reverseLookupTier(
  tool: ToolType,
  modelId: string
): "fast" | "standard" | "premium" {
  // Known fast-tier models
  const FAST_MODELS = [
    "triposr",
    "tripo-v25-mv",
    "flux-schnell",
  ];
  // Known premium-tier models
  const PREMIUM_MODELS = [
    "hunyuan3d-v31-pro",
    "flux-pro",
  ];

  if (FAST_MODELS.includes(modelId)) return "fast";
  if (PREMIUM_MODELS.includes(modelId)) return "premium";
  return "standard";
}
