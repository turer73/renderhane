import { getAIProvider } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { reserveCredits, refundCredits } from "@/lib/credits/engine";
import { isAdmin } from "@/lib/auth/admin-check";
import { routeRequest } from "@/lib/fal/smart-router";
import { uploadToR2 } from "@/lib/r2/upload";
import {
  completeJobOutputAndSpend,
  failJobAndRefund,
} from "@/lib/jobs/webhook-transitions";
import {
  buildFalWebhookUrl,
  getAcceptedProviderRequestId,
  ProviderReconciliationStateChangedError,
} from "@/lib/jobs/provider-webhook";
import { MAX_AVATAR_SCRIPT_CHARS, type ToolType, type ModelTier } from "@/lib/fal/models";

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
  requestId?: string;
  creditCost: number;
  status: "completed" | "failed" | "processing";
  submissionState?: "accepted" | "indeterminate";
  output?: { url: string; thumbnailUrl?: string } | null;
  error?: string;
  warning?: "provider_submission_outcome_indeterminate";
}

function isDefinitiveProviderRejection(status: unknown): status is number {
  return (
    typeof status === "number" &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 409 &&
    status !== 499
  );
}

export async function submitJobSync(input: SubmitSyncInput): Promise<SubmitSyncResult> {
  const { userId, tool, tier, imageUrl, imageUrls, script, audioUrl } = input;
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
  const { model } = routeRequest({ tool, tier, imageUrl, imageUrls, prompt });

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

  const originalRequest: Record<string, unknown> = { tool };
  if (tier) originalRequest.tier = tier;
  if (imageUrl) originalRequest.imageUrl = imageUrl;
  if (imageUrls) originalRequest.imageUrls = imageUrls;
  if (prompt) originalRequest.prompt = prompt;
  if (script) originalRequest.script = script;
  if (audioUrl) originalRequest.audioUrl = audioUrl;

  // Persist the job before any paid provider call. A subscribe request may be
  // accepted even when its polling transport later times out.
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      user_id: userId,
      tool,
      model_id: model.id,
      status: "pending",
      input_params: {},
      original_request: originalRequest,
      credit_cost: creditCost,
      credit_tx_id: txId,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    if (txId) await refundCredits(txId);
    throw new Error(`Failed to create job: ${jobError?.message || "unknown"}`);
  }

  const persistProviderReconciliation = async (params: {
    stage: "tts" | "main";
    endpointId: string;
    state: "submission_attempted" | "accepted";
    requestId?: string;
    inputParams?: Record<string, unknown>;
    expectedPrevious?: {
      stage: "tts" | "main";
      endpointId: string;
      state: "submission_attempted" | "accepted";
      requestId?: string;
    };
  }) => {
    const nextProviderReconciliation = {
      stage: params.stage,
      endpointId: params.endpointId,
      state: params.state,
      ...(params.requestId ? { requestId: params.requestId } : {}),
      updatedAt: new Date().toISOString(),
    };
    const nextOriginalRequest = {
      ...originalRequest,
      providerReconciliation: nextProviderReconciliation,
    };

    let lastError: { message?: string } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      let updateQuery = supabase
        .from("jobs")
        .update({
          original_request: nextOriginalRequest,
          ...(params.inputParams ? { input_params: params.inputParams } : {}),
          ...(params.state === "submission_attempted"
            ? {
                status: "processing",
                started_at: new Date().toISOString(),
                ...(params.stage === "main" ? { fal_request_id: null } : {}),
              }
            : params.requestId
            ? {
                fal_request_id: params.requestId,
                started_at: new Date().toISOString(),
              }
            : {}),
        })
        .eq("id", job.id)
        .in("status", ["pending", "processing"]);

      if (params.expectedPrevious) {
        updateQuery = params.expectedPrevious.requestId
          ? updateQuery.eq("fal_request_id", params.expectedPrevious.requestId)
          : updateQuery.is("fal_request_id", null);
        updateQuery = updateQuery.contains("original_request", {
          providerReconciliation: params.expectedPrevious,
        });
      }

      const { data: persisted, error } = await updateQuery
        .select("id")
        .maybeSingle();
      if (!error && persisted) {
        originalRequest.providerReconciliation = nextProviderReconciliation;
        return;
      }
      lastError = error;
      if (!error && !persisted) {
        throw new ProviderReconciliationStateChangedError();
      }
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }

    throw new Error(
      `Failed to persist provider reconciliation state: ${
        lastError?.message ?? "unknown database error"
      }`
    );
  };

  const indeterminateResult = (requestId?: string): SubmitSyncResult => ({
    jobId: job.id,
    ...(requestId ? { requestId } : {}),
    creditCost,
    status: "processing",
    submissionState: "indeterminate",
    warning: "provider_submission_outcome_indeterminate",
  });

  let falInput: Record<string, unknown>;
  let mainSubmissionExpectedPrevious:
    | {
        stage: "tts";
        endpointId: string;
        state: "accepted";
        requestId: string;
      }
    | undefined;
  try {
    // Talking-avatar TTS pipeline: reservation must exist before this paid call.
    if (tool === "talking-avatar" && script && !audioUrl) {
      const ttsEndpointId = "fal-ai/f5-tts";
      const ttsInput = {
        gen_text: script,
        model_type: "F5-TTS",
        ref_audio_url:
          "https://github.com/SWivid/F5-TTS/raw/main/tests/ref_audio/test_en_1_ref_short.wav",
        ref_text: "",
      };
      await persistProviderReconciliation({
        stage: "tts",
        endpointId: ttsEndpointId,
        state: "submission_attempted",
      });

      let ttsResult;
      let acceptedTtsRequestId: string | null = null;
      try {
        ttsResult = await getAIProvider().subscribe(ttsEndpointId, ttsInput, {
          onEnqueue: async (requestId) => {
            await persistProviderReconciliation({
              stage: "tts",
              endpointId: ttsEndpointId,
              state: "accepted",
              requestId,
              expectedPrevious: {
                stage: "tts",
                endpointId: ttsEndpointId,
                state: "submission_attempted",
              },
            });
            acceptedTtsRequestId = requestId;
          },
        });
      } catch (error) {
        const acceptedRequestId = getAcceptedProviderRequestId(error);
        if (acceptedRequestId) return indeterminateResult(acceptedRequestId);
        const providerError = error as { status?: number };
        if (!isDefinitiveProviderRejection(providerError.status)) {
          return indeterminateResult();
        }
        throw error;
      }
      const ttsOutput = ttsResult.data as { audio_url?: { url?: string } };
      if (!ttsOutput.audio_url?.url) {
        throw new Error("TTS provider completed without an audio output");
      }
      if (!acceptedTtsRequestId) {
        return indeterminateResult(ttsResult.requestId);
      }
      mainSubmissionExpectedPrevious = {
        stage: "tts",
        endpointId: ttsEndpointId,
        state: "accepted",
        requestId: acceptedTtsRequestId,
      };
      prompt = ttsOutput.audio_url.url;
    }

    ({ input: falInput } = routeRequest({
      tool,
      tier,
      imageUrl,
      imageUrls,
      prompt,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "TTS generation failed";
    await failJobAndRefund({ jobId: job.id, errorMessage: message });
    return { jobId: job.id, creditCost: 0, status: "failed", error: message };
  }

  let webhookUrl: string;
  try {
    webhookUrl = buildFalWebhookUrl(job.id, txId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to configure provider webhook";
    await failJobAndRefund({ jobId: job.id, errorMessage: message });
    return { jobId: job.id, creditCost: 0, status: "failed", error: message };
  }

  try {
    await persistProviderReconciliation({
      stage: "main",
      endpointId: model.id,
      state: "submission_attempted",
      inputParams: falInput,
      expectedPrevious: mainSubmissionExpectedPrevious,
    });
  } catch (error) {
    if (error instanceof ProviderReconciliationStateChangedError) {
      return indeterminateResult();
    }
    const message =
      error instanceof Error
        ? error.message
        : "Failed to persist provider submission attempt";
    await failJobAndRefund({ jobId: job.id, errorMessage: message });
    return { jobId: job.id, creditCost: 0, status: "failed", error: message };
  }

  // 4. Run synchronously with fal.subscribe
  let providerOutputUrl: string | null = null;
  let acceptedMainRequestId: string | null = null;
  try {
    const result = await getAIProvider().subscribe(model.id, falInput, {
      webhookUrl,
      onEnqueue: async (requestId) => {
        await persistProviderReconciliation({
          stage: "main",
          endpointId: model.id,
          state: "accepted",
          requestId,
          expectedPrevious: {
            stage: "main",
            endpointId: model.id,
            state: "submission_attempted",
          },
        });
      },
    });
    acceptedMainRequestId = result.requestId;
    const payload = result.data as Record<string, unknown>;

    // Extract output URL
    const outputUrl = extractUrl(payload);
    if (!outputUrl) {
      const disposition = await failJobAndRefund({
        jobId: job.id,
        errorMessage: "Provider completed without a usable output",
      });
      if (
        disposition === "already_completed" ||
        disposition === "output_repaired"
      ) {
        return {
          jobId: job.id,
          requestId: result.requestId,
          creditCost,
          status: "completed",
          output: null,
        };
      }
      if (disposition === "output_present" || disposition === "not_eligible") {
        return indeterminateResult(result.requestId);
      }
      return {
        jobId: job.id,
        requestId: result.requestId,
        creditCost: 0,
        status: "failed",
        error: "Provider completed without a usable output",
      };
    }
    providerOutputUrl = outputUrl;

    const completion = await completeJobOutputAndSpend({
      jobId: job.id,
      falUrl: outputUrl,
      metadata: payload,
    });

    if (
      completion.disposition === "terminal_conflict" ||
      completion.disposition === "payload_conflict" ||
      !completion.outputId ||
      !completion.outputType
    ) {
      return {
        jobId: job.id,
        creditCost: 0,
        status: "failed",
        error: `Atomic completion declined: ${completion.disposition}`,
      };
    }

    // R2 is a post-commit durability enhancement. The provider URL, output,
    // job status and spend are already atomically durable in PostgreSQL.
    let r2Url = completion.r2Url;
    if (!r2Url) {
      try {
        const r2Result = await uploadToR2(
          outputUrl,
          completion.userId,
          completion.outputType
        );
        r2Url = r2Result.r2Url;
        const { error: r2UpdateError } = await supabase
          .from("outputs")
          .update({
            r2_url: r2Result.r2Url,
            file_size: r2Result.fileSize,
          })
          .eq("id", completion.outputId);
        if (r2UpdateError) {
          console.error("[submitJobSync] Failed to persist R2 metadata:", r2UpdateError);
        }
      } catch {
        // fal_url remains a durable, user-visible output.
      }
    }

    return {
      jobId: job.id,
      creditCost,
      status: "completed",
      output: { url: r2Url || outputUrl || "" },
    };

  } catch (error) {
    const msg = error instanceof Error ? error.message : "Processing failed";
    const providerError = error as { status?: number };
    const acceptedRequestId =
      getAcceptedProviderRequestId(error) ?? acceptedMainRequestId;

    if (!providerOutputUrl && acceptedRequestId) {
      return indeterminateResult(acceptedRequestId);
    }

    if (!providerOutputUrl && !isDefinitiveProviderRejection(providerError.status)) {
      return indeterminateResult();
    }

    const disposition = await failJobAndRefund({
      jobId: job.id,
      errorMessage: msg,
    });

    // The completion RPC may have committed even if its transport response was
    // lost. The failure RPC serializes on the same job row and tells us not to
    // misreport/refund that committed success.
    if (disposition === "already_completed" && providerOutputUrl) {
      return {
        jobId: job.id,
        creditCost,
        status: "completed",
        output: { url: providerOutputUrl },
      };
    }

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
