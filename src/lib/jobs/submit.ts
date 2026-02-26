import { fal } from "@fal-ai/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { reserveCredits, refundCredits } from "@/lib/credits/engine";
import { routeRequest } from "@/lib/fal/smart-router";
import type { ToolType, ModelTier } from "@/lib/fal/models";

interface SubmitJobInput {
  userId: string;
  projectId?: string;
  tool: ToolType;
  tier?: ModelTier;
  imageUrl: string;
}

export async function submitJob(input: SubmitJobInput) {
  const { userId, projectId, tool, tier, imageUrl } = input;
  const supabase = createAdminClient();

  // 1. Route to correct model
  const { model, modelKey, input: falInput } = routeRequest({
    tool,
    tier,
    imageUrl,
  });

  // 2. Reserve credits
  const txId = await reserveCredits(
    userId,
    model.creditCost,
    `${tool} — ${model.displayName.en}`
  );

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
      credit_cost: model.creditCost,
      credit_tx_id: txId,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    // Refund if job creation fails
    await refundCredits(txId);
    throw new Error("Failed to create job");
  }

  // 4. Submit to fal.ai queue with webhook
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/fal?jobId=${job.id}&txId=${txId}&secret=${process.env.FAL_WEBHOOK_SECRET}`;

  let result;
  try {
    result = await fal.queue.submit(model.id, {
      input: falInput,
      webhookUrl,
    });
  } catch (error) {
    // Refund credits and mark job as failed
    await refundCredits(txId);
    await supabase
      .from("jobs")
      .update({
        status: "failed",
        error_message: "Failed to submit to processing queue",
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    throw new Error("Failed to submit job to processing queue");
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
    creditCost: model.creditCost,
    estimatedTime: model.estimatedTime,
  };
}
