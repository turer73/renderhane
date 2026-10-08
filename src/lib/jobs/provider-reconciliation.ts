import "server-only";
import { getAIProvider } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { signWebhookPayload } from "@/lib/jobs/provider-webhook";
import { extractOutputUrl } from "@/lib/jobs/output-url";
import { imageUrlSchema } from "@/lib/validations/job-submit";

export interface AcceptedProviderJob {
  id: string;
  model_id: string;
  status: string;
  credit_tx_id: string | null;
  fal_request_id: string | null;
  original_request: Record<string, unknown> | null;
}

export type ProviderReconciliationOutcome =
  | "not_applicable"
  | "provider_pending"
  | "review_required"
  | "webhook_queued";

/** Read an existing request, never submit/retry an inference or guess a refund.
 * A recovered terminal event uses the same durable queue and job-bound atomic
 * output/credit transitions as a normal webhook. Queue admission is not job
 * completion; duplicate callback/cron events remain safe at the processor.
 */
export async function reconcileAcceptedProviderJob(
  job: AcceptedProviderJob,
  abortSignal: AbortSignal = AbortSignal.timeout(10_000),
): Promise<ProviderReconciliationOutcome> {
  if (!job.fal_request_id || !job.model_id || !["pending", "processing"].includes(job.status)) return "not_applicable";
  const marker = job.original_request?.providerReconciliation;
  if (marker !== undefined) {
    if (!marker || typeof marker !== "object" || Array.isArray(marker)) return "review_required";
    const state = marker as Record<string, unknown>;
    if (state.stage !== "main") return "not_applicable";
    if (state.state !== "accepted" || state.requestId !== job.fal_request_id || state.endpointId !== job.model_id) return "review_required";
  } else if (job.original_request?.tool === "talking-avatar") {
    // A legacy avatar request ID might belong to its intermediate TTS stage.
    return "review_required";
  }

  const provider = getAIProvider();
  const options = { abortSignal };
  let body: Record<string, unknown>;
  try {
    const status = await provider.status(job.model_id, job.fal_request_id, options);
    if (status.request_id !== job.fal_request_id) return "review_required";
    if (status.status === "IN_QUEUE" || status.status === "IN_PROGRESS") return "provider_pending";
    if (status.status !== "COMPLETED") return "review_required";

    const providerError = typeof status.error === "string" && status.error.trim()
      ? status.error
      : typeof status.error_type === "string" && status.error_type.trim()
        ? status.error_type
        : null;
    if (providerError) {
      body = { status: "ERROR", request_id: job.fal_request_id, payload: { message: providerError } };
    } else {
      const payload = await provider.result(job.model_id, job.fal_request_id, options);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "review_required";
      const record = payload as Record<string, unknown>;
      if (!imageUrlSchema.safeParse(extractOutputUrl(record)).success) return "review_required";
      body = { status: "OK", request_id: job.fal_request_id, payload: record };
    }
  } catch {
    // Transport/auth/404/result-fetch errors do not establish paid-job failure.
    return "provider_pending";
  }

  if (abortSignal.aborted) return "provider_pending";
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("enqueue_webhook", {
    p_payload: body,
    p_job_id: job.id,
    p_tx_id: job.credit_tx_id,
    p_signature: signWebhookPayload(`${job.id}:${job.credit_tx_id || ""}`),
  }).abortSignal(abortSignal);
  if (error || !((typeof data === "number" && Number.isSafeInteger(data) && data > 0) || (typeof data === "string" && /^\d+$/.test(data) && BigInt(data) > BigInt(0)))) {
    return "provider_pending";
  }
  return "webhook_queued";
}
