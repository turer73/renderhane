import { getAIProvider } from "@/lib/ai";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { reserveCredits, refundCredits } from "@/lib/credits/engine";
import { isAdmin } from "@/lib/auth/admin-check";
import { routeRequest } from "@/lib/fal/smart-router";
import { composeSmartPrompt } from "@/lib/prompts/compose";
import type { PromptContext } from "@/lib/prompts/presets";
import { MAX_AVATAR_SCRIPT_CHARS, type ToolType, type ModelTier } from "@/lib/fal/models";

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
        image_url: url,
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
        image_url: url,
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
  /** Text script for talking-avatar TTS. Reserved as part of the avatar job cost. */
  script?: string;
  /** Pre-generated audio URL for talking-avatar. Skips TTS when provided. */
  audioUrl?: string;
  /** Auto-enhance input images via aura-sr before 3D generation */
  autoEnhance?: boolean;
  /** Opt out of the automatic background removal for 3D models (keep original background) */
  skipBgRemove?: boolean;
  /** Tool-specific API params (e.g. Recraft style/colors). Merged into fal.ai input by smart-router. */
  extraParams?: Record<string, unknown>;
  /** Structured context for server-side smart prompt composition (scene/aplus/image-edit).
   *  Consumed here to build the final prompt — NOT forwarded to fal.ai. */
  promptContext?: PromptContext;
  /** Caller-provided email (web path already has it) — lets the admin check skip
   *  a redundant admin.getUserById round-trip. Omitted by API-key callers. */
  userEmail?: string;
}

export async function submitJob(input: SubmitJobInput) {
  const { userId, projectId, tool, tier, prompt, autoEnhance } = input;
  let imageUrl = input.imageUrl;
  let imageUrls = input.imageUrls;
  const supabase = createAdminClient();

  if (
    tool === "talking-avatar" &&
    input.script &&
    input.script.length > MAX_AVATAR_SCRIPT_CHARS
  ) {
    throw new Error(`Script too long (max ${MAX_AVATAR_SCRIPT_CHARS} characters)`);
  }

  // 0d. QR Code: the user's text is the DATA to encode. Generate a real,
  // high-error-correction QR matrix server-side, then let illusion-diffusion
  // (Monster Labs QR ControlNet) stylize it into scannable art. The previously
  // referenced "fal-ai/qr-codes" model does not exist on fal — this is the
  // correct two-step pattern. NOTE: real-world scannability depends on the
  // illusion-diffusion controlnet scale; verify with a device scan after deploy.
  let qrStylePrompt: string | null = null;
  if (tool === "qr-code") {
    const { toDataURL } = await import("qrcode");
    const encodeData = (prompt ?? "").trim() || "https://www.renderhane.com";
    imageUrl = await toDataURL(encodeData, {
      errorCorrectionLevel: "H", // tolerates stylization overlay
      margin: 2,
      width: 1024,
      color: { dark: "#000000", light: "#ffffff" },
    });
    qrStylePrompt =
      "intricate ornate artistic pattern, vibrant colors, high detail, masterpiece, sharp focus";
  }

  // Select the model and calculate the complete charge before any paid
  // preprocessing call. The final fal input is rebuilt after preprocessing.
  let effectivePrompt = qrStylePrompt ?? input.audioUrl ?? prompt;
  const usedSmartPrompt = Boolean(input.promptContext && SMART_PROMPT_TOOLS.includes(tool));
  const { model } = routeRequest({
    tool,
    tier,
    modelKey: input.modelKey,
    imageUrl,
    imageUrls,
    prompt: effectivePrompt,
    extraParams: input.extraParams,
  });

  // Check free/admin eligibility and reserve BEFORE paid preprocessing.
  let txId: string | null = null;
  const sourceImageCount = input.imageUrls?.length
    ? input.imageUrls.length
    : input.imageUrl
      ? 1
      : 0;
  const enhanceCost = tool === "3d-model" && autoEnhance
    ? sourceImageCount * 4
    : 0;
  let creditCost = model.creditCost + enhanceCost;

  // Admin (ADMIN_EMAILS allowlist) → sınırsız kullanım: krediyi sıfırla, rezervasyonu atla.
  try {
    // Use the caller-provided email when available (web path already has it)
    // to avoid a redundant admin.getUserById round-trip on every submit.
    const email =
      input.userEmail ?? (await supabase.auth.admin.getUserById(userId)).data?.user?.email;
    if (isAdmin(email)) creditCost = 0;
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

  // Persist a pending job before reserving. This gives the stuck-job cleanup a
  // durable recovery record if the runtime exits during paid preprocessing.
  const originalRequest: Record<string, unknown> = { tool, tier };
  if (input.modelKey) originalRequest.modelKey = input.modelKey;
  if (input.imageUrl) originalRequest.imageUrl = input.imageUrl;
  if (input.imageUrls) originalRequest.imageUrls = input.imageUrls;
  if (prompt) originalRequest.prompt = prompt;
  if (input.script) originalRequest.script = input.script;
  if (input.audioUrl) originalRequest.audioUrl = input.audioUrl;
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
      input_params: {},
      original_request: originalRequest,
      credit_cost: creditCost,
      credit_tx_id: null,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    console.error(
      "[submitJob] DB insert error:",
      jobError?.message,
      jobError?.code,
      jobError?.details
    );
    throw new Error(`Failed to create job: ${jobError?.message || "no job returned"}`);
  }

  const markJobFailed = async (message: string) => {
    await supabase
      .from("jobs")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
  };

  try {
    if (creditCost > 0) {
      txId = await reserveCredits(
        userId,
        creditCost,
        `${tool} — ${model.displayName.en} [job:${job.id}]`
      );

      const { error: linkError } = await supabase
        .from("jobs")
        .update({ credit_tx_id: txId })
        .eq("id", job.id);

      if (linkError) {
        await refundCredits(txId);
        txId = null;
        throw new Error(`Failed to link credit reservation: ${linkError.message}`);
      }
    }
  } catch (error) {
    await markJobFailed(
      error instanceof Error ? error.message : "Failed to reserve credits"
    );
    throw error;
  }

  // Paid preprocessing starts only after the durable job and reservation link
  // exist. Process exits are recovered by the existing stuck-job cleanup.
  let falInput: Record<string, unknown>;
  try {
    // Clean backgrounds before 3D generation unless the user opts out.
    if (tool === "3d-model" && !input.skipBgRemove) {
      if (imageUrls && imageUrls.length > 0) {
        imageUrls = await removeBackgrounds(imageUrls);
      } else if (imageUrl) {
        [imageUrl] = await removeBackgrounds([imageUrl]);
      }
    }

    // Aura SR is charged per source image, reflected in enhanceCost above.
    if (tool === "3d-model" && autoEnhance) {
      if (imageUrls && imageUrls.length > 0) {
        imageUrls = await enhanceImages(imageUrls);
      } else if (imageUrl) {
        [imageUrl] = await enhanceImages([imageUrl]);
      }
    }

    // Hybrid smart-prompt composition can call an AI provider, so it must not
    // happen before credit reservation.
    if (usedSmartPrompt) {
      effectivePrompt = await composeSmartPrompt({
        tool: tool as "scene" | "aplus" | "image-edit",
        modelKey: input.modelKey,
        ctx: input.promptContext!,
        userText: prompt,
      });
    }

    // Talking-avatar is a bundled TTS -> video pipeline. Reserve the complete
    // avatar job cost before generating the intermediate audio.
    if (tool === "talking-avatar" && input.script && !input.audioUrl) {
      const ttsResult = await getAIProvider().subscribe("fal-ai/f5-tts", {
        gen_text: input.script,
        model_type: "F5-TTS",
        ref_audio_url:
          "https://github.com/SWivid/F5-TTS/raw/main/tests/ref_audio/test_en_1_ref_short.wav",
        ref_text: "",
      });
      const ttsOutput = ttsResult.data as { audio_url?: { url?: string } };
      if (!ttsOutput.audio_url?.url) {
        throw new Error("TTS generation failed — no audio produced");
      }
      effectivePrompt = ttsOutput.audio_url.url;
    }

    if (tool === "talking-avatar" && !effectivePrompt) {
      throw new Error("Either script or audioUrl is required for talking-avatar");
    }

    ({ input: falInput } = routeRequest({
      tool,
      tier,
      modelKey: input.modelKey,
      imageUrl,
      imageUrls,
      prompt: effectivePrompt,
      extraParams: input.extraParams,
    }));
  } catch (error) {
    if (txId) await refundCredits(txId);
    await markJobFailed(
      error instanceof Error ? error.message : "Preprocessing failed"
    );
    throw error;
  }

  // Store final fal.ai-routed URLs after preprocessing (they may expire).
  const { error: inputUpdateError } = await supabase
    .from("jobs")
    .update({ input_params: falInput })
    .eq("id", job.id);

  if (inputUpdateError) {
    if (txId) await refundCredits(txId);
    const message = `Failed to persist job input: ${inputUpdateError.message}`;
    await markJobFailed(message);
    throw new Error(message);
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
