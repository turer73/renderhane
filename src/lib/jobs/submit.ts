import { getAIProvider } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { reserveCredits, refundCredits } from "@/lib/credits/engine";
import { isAdmin } from "@/lib/auth/admin-check";
import { routeRequest } from "@/lib/fal/smart-router";
import { composeSmartPrompt } from "@/lib/prompts/compose";
import type { PromptContext } from "@/lib/prompts/presets";
import { failJobAndRefund } from "@/lib/jobs/webhook-transitions";
import {
  buildFalWebhookUrl,
  getAcceptedProviderRequestId,
  ProviderReconciliationStateChangedError,
  signWebhookPayload,
} from "@/lib/jobs/provider-webhook";
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
export { signWebhookPayload };

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
  /**
   * Pre-created reservation for an atomic multi-job bundle. Internal callers
   * only: the amount must exactly match the selected model's effective cost.
   */
  reservedCredit?: {
    txId: string;
    amount: number;
  };
  /** Correlates child jobs to a durable orchestration request for recovery. */
  orchestrationRequestId?: string;
}

export type ProviderSubmissionState =
  | "accepted"
  | "indeterminate"
  | "accepted_reconciliation_pending";

export interface SubmitJobResult {
  jobId: string;
  requestId: string | null;
  creditCost: number;
  estimatedTime: string;
  submissionState: ProviderSubmissionState;
  composedPrompt?: string;
  warning?:
    | "provider_submission_outcome_indeterminate"
    | "provider_acceptance_persistence_pending";
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

export async function submitJob(input: SubmitJobInput): Promise<SubmitJobResult> {
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

  if (input.reservedCredit && input.reservedCredit.amount !== creditCost) {
    await refundCredits(input.reservedCredit.txId);
    throw new Error(
      `Reserved credit mismatch: expected ${creditCost}, received ${input.reservedCredit.amount}`
    );
  }

  if (input.reservedCredit) {
    txId = input.reservedCredit.txId;
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
  if (input.orchestrationRequestId) {
    originalRequest.orchestrationRequestId = input.orchestrationRequestId;
  }

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
      credit_tx_id: txId,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    if (txId) await refundCredits(txId);
    console.error(
      "[submitJob] DB insert error:",
      jobError?.message,
      jobError?.code,
      jobError?.details
    );
    throw new Error(`Failed to create job: ${jobError?.message || "no job returned"}`);
  }

  const failDurableJob = async (message: string) =>
    failJobAndRefund({ jobId: job.id, errorMessage: message });

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

  try {
    if (creditCost > 0 && !txId) {
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
    await failDurableJob(
      error instanceof Error ? error.message : "Failed to reserve credits"
    );
    throw error;
  }

  // Paid preprocessing starts only after the durable job and reservation link
  // exist. Process exits are recovered by the existing stuck-job cleanup.
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
      const ttsEndpointId = "fal-ai/f5-tts";
      const ttsInput = {
        gen_text: input.script,
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
        if (acceptedRequestId) {
          return {
            jobId: job.id,
            requestId: acceptedRequestId,
            creditCost,
            estimatedTime: model.estimatedTime,
            submissionState: "indeterminate",
            warning: "provider_submission_outcome_indeterminate",
          };
        }
        const providerError = error as { status?: number };
        if (!isDefinitiveProviderRejection(providerError.status)) {
          return {
            jobId: job.id,
            requestId: null,
            creditCost,
            estimatedTime: model.estimatedTime,
            submissionState: "indeterminate",
            warning: "provider_submission_outcome_indeterminate",
          };
        }
        throw error;
      }
      const ttsOutput = ttsResult.data as { audio_url?: { url?: string } };
      if (!ttsOutput.audio_url?.url) {
        throw new Error("TTS provider completed without an audio output");
      }
      if (!acceptedTtsRequestId) {
        return {
          jobId: job.id,
          requestId: ttsResult.requestId ?? null,
          creditCost,
          estimatedTime: model.estimatedTime,
          submissionState: "indeterminate",
          warning: "provider_submission_outcome_indeterminate",
        };
      }
      mainSubmissionExpectedPrevious = {
        stage: "tts",
        endpointId: ttsEndpointId,
        state: "accepted",
        requestId: acceptedTtsRequestId,
      };
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
    await failDurableJob(
      error instanceof Error ? error.message : "Preprocessing failed"
    );
    throw error;
  }

  // 4. Submit to fal.ai queue with webhook
  // Sign the payload with HMAC instead of passing the raw secret in the URL
  let webhookUrl: string;
  try {
    webhookUrl = buildFalWebhookUrl(job.id, txId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to configure provider webhook";
    await failDurableJob(message);
    throw error;
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
      return {
        jobId: job.id,
        requestId: null,
        creditCost,
        estimatedTime: model.estimatedTime,
        submissionState: "indeterminate",
        warning: "provider_submission_outcome_indeterminate",
        ...(usedSmartPrompt && effectivePrompt
          ? { composedPrompt: effectivePrompt }
          : {}),
      };
    }
    const message =
      error instanceof Error
        ? error.message
        : "Failed to persist provider submission attempt";
    await failDurableJob(message);
    throw error;
  }

  let result;
  try {
    result = await getAIProvider().submit(model.id, falInput, webhookUrl);
  } catch (error) {
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

    if (isDefinitiveProviderRejection(falError.status)) {
      await failDurableJob(errorMessage);
      throw new Error(errorMessage);
    }

    // A timeout, connection reset, 5xx, or conflict can arrive after fal.ai
    // accepted the queue request. Keep the durable job and reservation alive;
    // its signed webhook or the stale-job reconciler will decide the terminal
    // state. Returning the job ID prevents higher-level orchestration from
    // guessing a refund for an externally indeterminate request.
    return {
      jobId: job.id,
      requestId: null,
      creditCost,
      estimatedTime: model.estimatedTime,
      submissionState: "indeterminate",
      warning: "provider_submission_outcome_indeterminate",
      ...(usedSmartPrompt && effectivePrompt
        ? { composedPrompt: effectivePrompt }
        : {}),
    };
  }

  // 5. Persist provider acceptance. The update is idempotent and retried; if
  // its response remains unavailable, never refund an already accepted job.
  let acceptancePersisted = false;
  let acceptanceError: { message?: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: persisted, error } = await supabase
      .from("jobs")
      .update({
        fal_request_id: result.requestId,
        started_at: new Date().toISOString(),
        original_request: {
          ...originalRequest,
          providerReconciliation: {
            stage: "main",
            endpointId: model.id,
            state: "accepted",
            requestId: result.requestId,
            updatedAt: new Date().toISOString(),
          },
        },
      })
      .eq("id", job.id)
      .in("status", ["pending", "processing"])
      .is("fal_request_id", null)
      .contains("original_request", {
        providerReconciliation: {
          stage: "main",
          endpointId: model.id,
          state: "submission_attempted",
        },
      })
      .select("id")
      .maybeSingle();

    if (!error && persisted) {
      acceptancePersisted = true;
      break;
    }
    acceptanceError = error;
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }

  if (!acceptancePersisted) {
    console.error(
      `[submitJob] Provider accepted ${job.id}, but request state persistence is pending:`,
      acceptanceError?.message ?? "unknown database error"
    );
  }

  return {
    jobId: job.id,
    requestId: result.requestId,
    creditCost,
    estimatedTime: model.estimatedTime,
    submissionState: acceptancePersisted
      ? "accepted"
      : "accepted_reconciliation_pending",
    ...(!acceptancePersisted
      ? { warning: "provider_acceptance_persistence_pending" as const }
      : {}),
    ...(usedSmartPrompt && effectivePrompt ? { composedPrompt: effectivePrompt } : {}),
  };
}
