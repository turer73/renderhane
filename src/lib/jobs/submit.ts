import { fal } from "@fal-ai/client";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { reserveCredits, refundCredits } from "@/lib/credits/engine";
import { routeRequest } from "@/lib/fal/smart-router";
import type { ToolType, ModelTier } from "@/lib/fal/models";

/**
 * Auto-remove backgrounds from images before 3D model generation.
 * Uses birefnet (fal.subscribe for synchronous result).
 * Returns cleaned image URLs from fal.ai CDN.
 */
async function removeBackgrounds(imageUrls: string[]): Promise<string[]> {
  const cleaned: string[] = [];
  for (const url of imageUrls) {
    try {
      const result = await fal.subscribe("fal-ai/birefnet/v2", {
        input: { image_url: url },
      });
      const output = result.data as { image?: { url?: string } };
      if (output.image?.url) {
        cleaned.push(output.image.url);
      } else {
        // Fallback to original if bg-remove output is unexpected
        cleaned.push(url);
      }
    } catch (err) {
      console.error("Auto bg-remove failed for URL, using original:", err);
      cleaned.push(url);
    }
  }
  return cleaned;
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
  imageUrl?: string;
  /** Multiple image URLs for multi-view models (e.g. 3D) */
  imageUrls?: string[];
  /** Optional user-provided text prompt (scene description, video prompt, etc.) */
  prompt?: string;
}

export async function submitJob(input: SubmitJobInput) {
  const { userId, projectId, tool, tier, prompt } = input;
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

  // 1. Route to correct model
  const { model, input: falInput } = routeRequest({
    tool,
    tier,
    imageUrl,
    imageUrls,
    prompt,
  });

  // 2. Check free bg-remove eligibility BEFORE reserving credits
  let txId: string | null = null;
  let creditCost = model.creditCost;

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
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      user_id: userId,
      project_id: projectId,
      tool,
      model_id: model.id,
      status: "pending",
      input_params: falInput,
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
    result = await fal.queue.submit(model.id, {
      input: falInput,
      webhookUrl,
    });
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
      fal_request_id: result.request_id,
      status: "processing",
      started_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  return {
    jobId: job.id,
    requestId: result.request_id,
    creditCost,
    estimatedTime: model.estimatedTime,
  };
}
