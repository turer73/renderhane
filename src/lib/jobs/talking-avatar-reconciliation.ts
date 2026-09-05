import "server-only";

import { getAIProvider } from "@/lib/ai";
import { routeRequest } from "@/lib/fal/smart-router";
import type { ModelTier } from "@/lib/fal/models";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildFalWebhookUrl } from "@/lib/jobs/provider-webhook";
import { failJobAndRefund } from "@/lib/jobs/webhook-transitions";

export interface TalkingAvatarReconciliationJob {
  id: string;
  user_id: string;
  model_id: string;
  status: string;
  credit_tx_id: string | null;
  fal_request_id: string | null;
  original_request: Record<string, unknown> | null;
}

export type TalkingAvatarReconciliationOutcome =
  | "not_applicable"
  | "provider_pending"
  | "main_resubmitted"
  | "main_submission_indeterminate"
  | "terminal"
  | "failed_refunded";

function isDefinitiveSubmissionRejection(status: unknown): status is number {
  return (
    typeof status === "number" &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 409 &&
    status !== 425 &&
    status !== 429 &&
    status !== 499
  );
}

function extractAudioUrl(payload: Record<string, unknown>): string | null {
  if (typeof payload.audio_url === "string") return payload.audio_url;
  const audioUrl = payload.audio_url as { url?: unknown } | undefined;
  if (typeof audioUrl?.url === "string") return audioUrl.url;
  const audio = payload.audio as { url?: unknown } | undefined;
  return typeof audio?.url === "string" ? audio.url : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function completedProviderFailure(status: {
  error?: unknown;
  error_type?: unknown;
}): string | null {
  const errorType = asString(status.error_type)?.trim();
  const errorMessage = asString(status.error)?.trim();
  if (!errorType && !errorMessage) return null;

  return [errorType, errorMessage].filter(Boolean).join(": ").slice(0, 500);
}

async function terminalizeFailedJob(
  jobId: string,
  message: string
): Promise<TalkingAvatarReconciliationOutcome> {
  const disposition = await failJobAndRefund({ jobId, errorMessage: message });
  if (
    disposition === "failed_refunded" ||
    disposition === "already_failed_refunded" ||
    disposition === "failed_no_charge"
  ) {
    return "failed_refunded";
  }
  if (
    disposition === "already_completed" ||
    disposition === "output_repaired"
  ) {
    return "terminal";
  }
  return "provider_pending";
}

/**
 * Resume the main avatar submission after a durable TTS enqueue whose local
 * status/result polling was interrupted. The JSON containment update is the
 * single-winner CAS: only one reconciler may advance tts/accepted to
 * main/submission_attempted and invoke the external provider.
 */
export async function reconcileTalkingAvatarTts(
  job: TalkingAvatarReconciliationJob
): Promise<TalkingAvatarReconciliationOutcome> {
  const originalRequest = job.original_request;
  const marker =
    originalRequest?.providerReconciliation &&
    typeof originalRequest.providerReconciliation === "object"
      ? (originalRequest.providerReconciliation as Record<string, unknown>)
      : null;
  const ttsRequestId = asString(marker?.requestId);
  const ttsEndpointId = asString(marker?.endpointId);

  if (
    !originalRequest ||
    originalRequest.tool !== "talking-avatar" ||
    marker?.stage !== "tts" ||
    marker?.state !== "accepted" ||
    !ttsRequestId ||
    !ttsEndpointId ||
    job.fal_request_id !== ttsRequestId
  ) {
    return "not_applicable";
  }

  const provider = getAIProvider();
  let status: { status?: unknown; error?: unknown; error_type?: unknown };
  try {
    status = await provider.status(ttsEndpointId, ttsRequestId);
  } catch {
    // Once the provider accepted a request, an HTTP retrieval error (including
    // 401/403/404) says nothing definitive about the queued job's lifecycle.
    // Only an explicit terminal provider state may authorize a refund.
    return "provider_pending";
  }
  if (status.status === "COMPLETED") {
    const providerFailure = completedProviderFailure(status);
    if (providerFailure) {
      return terminalizeFailedJob(
        job.id,
        `TTS provider completed with error: ${providerFailure}`
      );
    }
  }
  // Defensive compatibility for non-standard/legacy adapters. Fal's documented
  // queue lifecycle uses COMPLETED + error/error_type for terminal failures.
  if (["FAILED", "ERROR", "CANCELLED"].includes(String(status.status))) {
    return terminalizeFailedJob(
      job.id,
      `TTS provider reached terminal state: ${status.status}`
    );
  }
  if (status.status !== "COMPLETED") return "provider_pending";

  let ttsPayload: Record<string, unknown>;
  try {
    ttsPayload = await provider.result<Record<string, unknown>>(
      ttsEndpointId,
      ttsRequestId
    );
  } catch {
    // Result retrieval can fail because of credentials, endpoint drift, or
    // transient propagation even after the model completed. Keep the local
    // reservation pending until a durable terminal state/output is observed.
    return "provider_pending";
  }

  const audioUrl = extractAudioUrl(ttsPayload);
  if (!audioUrl) {
    return terminalizeFailedJob(
      job.id,
      "TTS provider completed without an audio output"
    );
  }

  let model: { id: string };
  let falInput: Record<string, unknown>;
  let webhookUrl: string;
  try {
    const routed = routeRequest({
      tool: "talking-avatar",
      tier: asString(originalRequest.tier) as ModelTier | undefined,
      modelKey: asString(originalRequest.modelKey),
      imageUrl: asString(originalRequest.imageUrl),
      imageUrls: Array.isArray(originalRequest.imageUrls)
        ? originalRequest.imageUrls.filter(
            (value): value is string => typeof value === "string"
          )
        : undefined,
      prompt: audioUrl,
      extraParams:
        originalRequest.extraParams &&
        typeof originalRequest.extraParams === "object" &&
        !Array.isArray(originalRequest.extraParams)
          ? (originalRequest.extraParams as Record<string, unknown>)
          : undefined,
    });
    model = routed.model;
    falInput = routed.input;
    if (model.id !== job.model_id) {
      throw new Error("Talking-avatar model drifted during TTS reconciliation");
    }
    webhookUrl = buildFalWebhookUrl(job.id, job.credit_tx_id);
  } catch (error) {
    return terminalizeFailedJob(
      job.id,
      error instanceof Error
        ? error.message
        : "Failed to rebuild talking-avatar provider input"
    );
  }

  const mainAttempt = {
    ...originalRequest,
    providerReconciliation: {
      stage: "main",
      endpointId: model.id,
      state: "submission_attempted",
      updatedAt: new Date().toISOString(),
    },
  };
  const supabase = createAdminClient();
  const { data: claimed, error: claimError } = await supabase
    .from("jobs")
    .update({
      // The previous ID belongs to the TTS endpoint. Clearing it in the same
      // single-winner CAS prevents a stale TTS handler from starting a second
      // paid main request while this submission has no request ID yet.
      fal_request_id: null,
      input_params: falInput,
      original_request: mainAttempt,
      status: "processing",
      started_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("fal_request_id", ttsRequestId)
    .in("status", ["pending", "processing"])
    .contains("original_request", {
      providerReconciliation: {
        stage: "tts",
        endpointId: ttsEndpointId,
        state: "accepted",
        requestId: ttsRequestId,
      },
    })
    .select("id")
    .maybeSingle();

  if (claimError || !claimed) return "provider_pending";

  let submitted: { requestId: string };
  try {
    submitted = await provider.submit(model.id, falInput, webhookUrl);
  } catch (error) {
    const providerError = error as { status?: unknown };
    if (isDefinitiveSubmissionRejection(providerError.status)) {
      return terminalizeFailedJob(
        job.id,
        error instanceof Error
          ? error.message
          : "Talking-avatar provider rejected the resumed request"
      );
    }
    return "main_submission_indeterminate";
  }

  const acceptedRequest = {
    ...mainAttempt,
    providerReconciliation: {
      stage: "main",
      endpointId: model.id,
      state: "accepted",
      requestId: submitted.requestId,
      updatedAt: new Date().toISOString(),
    },
  };
  const { data: accepted, error: acceptanceError } = await supabase
    .from("jobs")
    .update({
      fal_request_id: submitted.requestId,
      original_request: acceptedRequest,
      started_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .is("fal_request_id", null)
    .in("status", ["pending", "processing"])
    .contains("original_request", {
      providerReconciliation: {
        stage: "main",
        endpointId: model.id,
        state: "submission_attempted",
      },
    })
    .select("id")
    .maybeSingle();

  return acceptanceError || !accepted ? "provider_pending" : "main_resubmitted";
}
