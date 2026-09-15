import { getAIProvider } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { reserveCredits, confirmSpend, refundCredits } from "@/lib/credits/engine";
import { isAdmin } from "@/lib/auth/admin-check";
import { routeRequest } from "@/lib/fal/smart-router";
import { uploadToR2 } from "@/lib/r2/upload";
import { MAX_AVATAR_SCRIPT_CHARS, MODELS, type ToolType, type ModelTier } from "@/lib/fal/models";
import { buildMinimaxInput, isAllowedVoice, DEFAULT_SRT_VOICE } from "@/lib/voiceover/voices";

/**
 * Synchronous job submission — uses fal.subscribe instead of queue+webhook.
 * Waits for the result and returns it directly.
 * Best for API v1 consumers who want a simple request/response flow.
 */

interface SubmitSyncInput {
  userId: string;
  tool: ToolType;
  tier?: ModelTier;
  /** Explicit model key — forwarded to smart-router (e.g. nano-banana-pro). */
  modelKey?: string;
  imageUrl?: string;
  imageUrls?: string[];
  prompt?: string;
  /** Text script for talking-avatar TTS — converted to audio before submission */
  script?: string;
  /** Voice ID for talking-avatar TTS (MiniMax allowlist, default Turkish_CalmWoman). */
  voiceId?: string;
  /** Pre-made audio URL for talking-avatar — skips TTS */
  audioUrl?: string;
  /** Tool-specific API params (logo only) — validated by smart-router. */
  extraParams?: Record<string, unknown>;
}

interface SubmitSyncResult {
  jobId: string;
  creditCost: number;
  status: "completed" | "failed";
  output?: { url: string; thumbnailUrl?: string } | null;
  error?: string;
}

export async function submitJobSync(input: SubmitSyncInput): Promise<SubmitSyncResult> {
  const { userId, tool, tier, imageUrl, imageUrls, script, audioUrl, modelKey, extraParams, voiceId } = input;
  let { prompt } = input;
  const supabase = createAdminClient();

  // Ses süresi maliyeti belirler ($0.16/sn) — script sınırı zorunlu.
  if (tool === "talking-avatar" && script && script.length > MAX_AVATAR_SCRIPT_CHARS) {
    throw new Error(
      `Script too long (max ${MAX_AVATAR_SCRIPT_CHARS} characters)`
    );
  }
  if (tool === "talking-avatar" && !script && !audioUrl) {
    throw new Error("Either script or audioUrl is required for talking-avatar");
  }
  if (tool === "talking-avatar" && audioUrl) prompt = audioUrl;

  // Select and price the model before any paid TTS call. The final provider
  // input is rebuilt after TTS resolves.
  const { model } = routeRequest({ tool, tier, modelKey, imageUrl, imageUrls, prompt, extraParams });

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

  let falInput: Record<string, unknown>;
  try {
    // Talking-avatar TTS pipeline: reservation must exist before this paid call.
    // MiniMax 2.8 HD (Türkçe sesler) — eski F5 borusu emekli.
    if (tool === "talking-avatar" && script && !audioUrl) {
      const avatarVoice =
        voiceId && isAllowedVoice(voiceId) ? voiceId : DEFAULT_SRT_VOICE;
      const ttsResult = await getAIProvider().subscribe("fal-ai/minimax/speech-2.8-hd", {
        ...MODELS["minimax-speech-28-hd"].defaultParams,
        ...buildMinimaxInput(script, {
          voiceId: avatarVoice,
          emotion: "neutral",
          speed: 1,
        }),
      });
      const ttsOutput = ttsResult.data as { audio?: { url?: string } };
      if (!ttsOutput.audio?.url) {
        throw new Error("TTS generation failed — no audio produced");
      }
      prompt = ttsOutput.audio.url;
    }

    ({ input: falInput } = routeRequest({
      tool,
      tier,
      modelKey,
      imageUrl,
      imageUrls,
      prompt,
      extraParams,
    }));
  } catch (error) {
    if (txId) await refundCredits(txId);
    const message = error instanceof Error ? error.message : "TTS generation failed";
    return { jobId: "", creditCost: 0, status: "failed", error: message };
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
        const r2Type = tool === "video" || tool === "talking-avatar" ? "video" : tool === "srt-voiceover" ? "audio" : "image";
        const r2Result = await uploadToR2(outputUrl, userId, r2Type);
        r2Url = r2Result.r2Url;
      } catch { /* fal_url still works */ }
    }

    // Save output
    await supabase.from("outputs").insert({
      job_id: job.id,
      user_id: userId,
      type: tool === "3d-model" ? "glb" : tool === "video" || tool === "talking-avatar" ? "video" : tool === "srt-voiceover" ? "audio" : "image",
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
