import { getAIProvider } from "@/lib/ai";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { reserveCredits, refundCredits } from "@/lib/credits/engine";
import { isAdmin } from "@/lib/auth/admin-check";
import { routeRequest } from "@/lib/fal/smart-router";
import { composeSmartPrompt } from "@/lib/prompts/compose";
import type { PromptContext } from "@/lib/prompts/presets";
import type { ToolType, ModelTier } from "@/lib/fal/models";

/** Tools whose final prompt is composed server-side from structured context. */
const SMART_PROMPT_TOOLS: ToolType[] = ["scene", "aplus", "image-edit"];

/**
 * Auto-remove backgrounds from images before 3D model generation.
 * Uses birefnet (fal.subscribe for synchronous result).
 * Returns cleaned image URLs from fal.ai CDN.
 */
async function removeBackgrounds(imageUrls: string[]): Promise<string[]> {
  const results = await Promise.allSettled(
    imageUrls.map(async (url) => {
      const result = await getAIProvider().subscribe("fal-ai/birefnet/v2", {
        input: { image_url: url },
      });
      const output = result.data as { image?: { url?: string } };
      return output.image?.url ?? url;
    })
  );
  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.error("Auto bg-remove failed for URL, using original:", imageUrls[i], r.reason);
    return imageUrls[i];
  });
}

/**
 * Auto-enhance images using aura-sr super-resolution.
 * Uses fal.subscribe for synchronous result.
 * Returns enhanced image URLs from fal.ai CDN.
 */
async function enhanceImages(imageUrls: string[]): Promise<string[]> {
  const results = await Promise.allSettled(
    imageUrls.map(async (url) => {
      const result = await getAIProvider().subscribe("fal-ai/aura-sr", {
        input: { image_url: url },
      });
      const output = result.data as { image?: { url?: string } };
      return output.image?.url ?? url;
    })
  );
  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.error("Auto enhance failed for URL, using original:", imageUrls[i], r.reason);
    return imageUrls[i];
  });
}

/**
 * Generate an HMAC signature for webhook verification.
 * This replaces passing the raw secret in the URL query string.
 */
export function signWebhookPayload(data: string): string {
  const secret = process.env.FAL_WEBHOOK_SECRET;
  if (!secret) throw new Error("FAL_WEBHOOK_SECRET is not set");
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

interface SubmitJobInput {
  userId: string;
  projectId?: string;
  tool: ToolType;
  tier?: ModelTier;
  /** Explicit model key — when set, smart-router uses it directly and skips tier-based selection. */
  modelKey?: string;
  imageUrl?: string;
  /** Multiple image URLs for multi-view models (e.g. 3D) */
  imageUrls?: string[];
  /** Optional user-provided text prompt (scene description, video prompt, etc.) */
  prompt?: string;
  /** Auto-enhance input images via aura-sr before 3D generation */
  autoEnhance?: boolean;
  /** Tool-specific API params (e.g. Recraft style/colors). Merged into fal.ai input by smart-router. */
  extraParams?: Record<string, unknown>;
  /** Structured context for server-side smart prompt composition (scene/aplus/image-edit).
   *  Consumed here to build the final prompt — NOT forwarded to fal.ai. */
  promptContext?: PromptContext;
}

export async function submitJob(input: SubmitJobInput) {
  const { userId, projectId, tool, tier, prompt, autoEnhance } = input;
  let imageUrl = input.imageUrl;
  let imageUrls = input.imageUrls;
  const supabase = createAdminClient();

  // 0. Auto bg-remove for 3D models — clean backgrounds improve TRELLIS quality
  if (tool === "3d-model") {
    if (imageUrls && imageUrls.length > 0) {
      imageUrls = await removeBackgrounds(imageUrls);
    } else if (imageUrl) {
      [imageUrl] = await removeBackgrounds([imageUrl]);
    }
  }

  // 0b. Auto-enhance for 3D models — aura-sr upscale improves detail for 3D generation
  if (tool === "3d-model" && autoEnhance) {
    if (imageUrls && imageUrls.length > 0) {
      imageUrls = await enhanceImages(imageUrls);
    } else if (imageUrl) {
      [imageUrl] = await enhanceImages([imageUrl]);
    }
  }

  // 0c. Smart prompt composition (hybrid: preset backbone + LLM blend) for
  // scene / aplus / image-edit. The SITE builds the final prompt from the
  // scene type + auto-detected product caption + user notes. Never throws and
  // falls back to the deterministic backbone, so generation is never blocked.
  let effectivePrompt = prompt;
  const usedSmartPrompt = Boolean(input.promptContext && SMART_PROMPT_TOOLS.includes(tool));
  if (usedSmartPrompt) {
    effectivePrompt = await composeSmartPrompt({
      tool: tool as "scene" | "aplus" | "image-edit",
      modelKey: input.modelKey,
      ctx: input.promptContext!,
      userText: prompt,
    });
  }

  // 1. Route to correct model
  const { model, input: falInput } = routeRequest({
    tool,
    tier,
    modelKey: input.modelKey,
    imageUrl,
    imageUrls,
    prompt: effectivePrompt,
    extraParams: input.extraParams,
  });

  // 2. Check free bg-remove eligibility BEFORE reserving credits
  let txId: string | null = null;
  // Add auto-enhance cost (+4 per image) to the base model cost
  let creditCost = model.creditCost + (autoEnhance ? 4 : 0);

  // Admin (ADMIN_EMAILS allowlist) → sınırsız kullanım: krediyi sıfırla, rezervasyonu atla.
  try {
    const { data: au } = await supabase.auth.admin.getUserById(userId);
    if (isAdmin(au?.user?.email)) creditCost = 0;
  } catch { /* email çözülemezse normal kredi akışı sürer */ }

  if (tool === "bg-remove") {
    const { data: isFree, error: freeCheckError } = await supabase.rpc(
      "check_free_bg_remove",
      { p_user_id: userId }
    );

    if (!freeCheckError && isFree === true) {
      // Free usage — skip credit reservation, set cost to 0
      creditCost = 0;
    }
  }

  if (creditCost > 0) {
    txId = await reserveCredits(
      userId,
      creditCost,
      `${tool} — ${model.displayName.en}`
    );
  }

  // 3. Create job record
  // Store original request params (pre-processing) for reliable regeneration.
  // input_params has fal.ai-routed URLs (may expire); original_request has user's uploads.
  const originalRequest: Record<string, unknown> = { tool, tier };
  if (input.modelKey) originalRequest.modelKey = input.modelKey;
  if (input.imageUrl) originalRequest.imageUrl = input.imageUrl;
  if (input.imageUrls) originalRequest.imageUrls = input.imageUrls;
  if (effectivePrompt) originalRequest.prompt = effectivePrompt;
  if (autoEnhance) originalRequest.autoEnhance = true;
  if (input.extraParams) originalRequest.extraParams = input.extraParams;

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      user_id: userId,
      project_id: projectId,
      tool,
      model_id: model.id,
      status: "pending",
      input_params: falInput,
      original_request: originalRequest,
      credit_cost: creditCost,
      credit_tx_id: txId,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    // Refund if job creation fails (only if credits were reserved)
    console.error("[submitJob] DB insert error:", jobError?.message, jobError?.code, jobError?.details);
    if (txId) await refundCredits(txId);
    throw new Error(`Failed to create job: ${jobError?.message || "no job returned"}`);
  }

  // 4. Submit to fal.ai queue with webhook
  // Sign the payload with HMAC instead of passing the raw secret in the URL
  const webhookPayload = `${job.id}:${txId || ""}`;
  const signature = signWebhookPayload(webhookPayload);
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/fal?jobId=${job.id}${txId ? `&txId=${txId}` : ""}&sig=${signature}`;

  let result;
  try {
    result = await getAIProvider().submit(model.id, falInput, webhookUrl);
  } catch (error) {
    // Refund credits and mark job as failed (only if credits were reserved)
    if (txId) await refundCredits(txId);

    // Extract meaningful error from fal.ai response
    const falError = error as { status?: number; body?: { detail?: string } };
    let errorMessage = "Failed to submit to processing queue";
    if (falError.status === 403) {
      errorMessage = "AI processing service temporarily unavailable";
    } else if (falError.body?.detail) {
      errorMessage = falError.body.detail;
    }

    console.error("fal.ai submit error:", {
      model: model.id,
      status: falError.status,
      detail: falError.body?.detail,
    });

    await supabase
      .from("jobs")
      .update({
        status: "failed",
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    throw new Error(errorMessage);
  }

  // 5. Update job with fal request ID
  await supabase
    .from("jobs")
    .update({
      fal_request_id: result.requestId,
      status: "processing",
      started_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  return {
    jobId: job.id,
    requestId: result.requestId,
    creditCost,
    estimatedTime: model.estimatedTime,
    ...(usedSmartPrompt && effectivePrompt ? { composedPrompt: effectivePrompt } : {}),
  };
}
