import { getAIProvider } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { reserveCredits, confirmSpend, refundCredits } from "@/lib/credits/engine";
import { isAdmin } from "@/lib/auth/admin-check";
import { routeRequest } from "@/lib/fal/smart-router";
import { uploadToR2 } from "@/lib/r2/upload";
import type { ToolType, ModelTier } from "@/lib/fal/models";

/**
 * Synchronous job submission — uses fal.subscribe instead of queue+webhook.
 * Waits for the result and returns it directly.
 * Best for API v1 consumers who want a simple request/response flow.
 */

interface SubmitSyncInput {
  userId: string;
  tool: ToolType;
  tier?: ModelTier;
  imageUrl?: string;
  imageUrls?: string[];
  prompt?: string;
  /** Text script for talking-avatar TTS — converted to audio before submission */
  script?: string;
  /** Pre-made audio URL for talking-avatar — skips TTS */
  audioUrl?: string;
}

interface SubmitSyncResult {
  jobId: string;
  creditCost: number;
  status: "completed" | "failed";
  output?: { url: string; thumbnailUrl?: string } | null;
  error?: string;
}

export async function submitJobSync(input: SubmitSyncInput): Promise<SubmitSyncResult> {
  const { userId, tool, tier, imageUrl, imageUrls, script, audioUrl } = input;
  let { prompt } = input;
  const supabase = createAdminClient();

  // Talking-avatar TTS pipeline: convert script text → audio URL
  if (tool === "talking-avatar" && script && !audioUrl) {
    const ttsResult = await getAIProvider().subscribe("fal-ai/f5-tts", {
      gen_text: script,
      model_type: "F5-TTS",
      ref_audio_url:
        "https://github.com/SWivid/F5-TTS/raw/main/tests/ref_audio/test_en_1_ref_short.wav",
      ref_text: "",
    });
    const ttsOutput = ttsResult.data as { audio_url?: { url?: string } };
    if (!ttsOutput.audio_url?.url) {
      return { jobId: "", creditCost: 0, status: "failed", error: "TTS generation failed — no audio produced" };
    }
    prompt = ttsOutput.audio_url.url;
  } else if (tool === "talking-avatar" && audioUrl) {
    prompt = audioUrl;
  }

  // 1. Route to model
  const { model, input: falInput } = routeRequest({ tool, tier, imageUrl, imageUrls, prompt });

  // 2. Reserve credits
  let txId: string | null = null;
  let creditCost = model.creditCost;

  // Admin (ADMIN_EMAILS allowlist) → sınırsız kullanım: krediyi sıfırla, rezervasyonu atla.
  try {
    const { data: au } = await supabase.auth.admin.getUserById(userId);
    if (isAdmin(au?.user?.email)) creditCost = 0;
  } catch { /* email çözülemezse normal kredi akışı sürer */ }

  if (tool === "bg-remove") {
    const { data: isFree } = await supabase.rpc("check_free_bg_remove", { p_user_id: userId });
    if (isFree === true) creditCost = 0;
  }

  if (creditCost > 0) {
    txId = await reserveCredits(userId, creditCost, `${tool} — ${model.displayName.en}`);
  }

  // 3. Create job record
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      user_id: userId,
      tool,
      model_id: model.id,
      status: "processing",
      input_params: falInput,
      credit_cost: creditCost,
      credit_tx_id: txId,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (jobError || !job) {
    if (txId) await refundCredits(txId);
    throw new Error(`Failed to create job: ${jobError?.message || "unknown"}`);
  }

  // 4. Run synchronously with fal.subscribe
  try {
    const result = await getAIProvider().subscribe(model.id, falInput);
    const payload = result.data as Record<string, unknown>;

    // Extract output URL
    const outputUrl = extractUrl(payload);

    // Upload to R2
    let r2Url: string | null = null;
    if (outputUrl) {
      try {
        const r2Result = await uploadToR2(outputUrl, userId, tool === "video" ? "video" : "image");
        r2Url = r2Result.r2Url;
      } catch { /* fal_url still works */ }
    }

    // Save output
    await supabase.from("outputs").insert({
      job_id: job.id,
      user_id: userId,
      type: tool === "3d-model" ? "glb" : tool === "video" ? "video" : "image",
      fal_url: outputUrl,
      r2_url: r2Url,
      metadata: payload,
    });

    // Mark completed
    await supabase.from("jobs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", job.id);

    // Confirm spend
    if (txId) await confirmSpend(txId, job.id);

    return {
      jobId: job.id,
      creditCost,
      status: "completed",
      output: { url: r2Url || outputUrl || "" },
    };

  } catch (error) {
    // Refund and mark failed
    if (txId) await refundCredits(txId);
    const msg = error instanceof Error ? error.message : "Processing failed";

    await supabase.from("jobs").update({
      status: "failed",
      error_message: msg,
      completed_at: new Date().toISOString(),
    }).eq("id", job.id);

    return { jobId: job.id, creditCost: 0, status: "failed", error: msg };
  }
}

function extractUrl(payload: Record<string, unknown>): string | null {
  const image = payload.image as { url?: string } | undefined;
  if (image?.url) return image.url;

  const images = payload.images as { url?: string }[] | undefined;
  if (images?.[0]?.url) return images[0].url;

  const video = payload.video as { url?: string } | undefined;
  if (video?.url) return video.url;

  if (typeof payload.result_url === "string") return payload.result_url;

  const modelMesh = payload.model_mesh as { url?: string } | undefined;
  if (modelMesh?.url) return modelMesh.url;

  // Regex fallback
  const jsonStr = JSON.stringify(payload);
  const match = jsonStr.match(/"url"\s*:\s*"(https?:\/\/[^"]+)"/);
  return match?.[1] || null;
}
