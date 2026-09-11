import {
  submitJob,
  type ProviderSubmissionState,
} from "@/lib/jobs/submit";
import { APLUS_SCENES, getScenePrompt } from "@/lib/fal/aplus-scenes";
import {
  MAX_AVATAR_SCRIPT_CHARS,
  MODELS,
  SOCIAL_KIT_SCENE_COUNT,
  SOCIAL_KIT_SCENE_MODEL,
  SOCIAL_KIT_VIDEO_MODEL,
} from "@/lib/fal/models";
import {
  CreditError,
} from "@/lib/credits/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth/admin-check";
import { autoCreateProject } from "@/lib/jobs/api-helpers";
import { reserveSocialKitRequestBundle } from "@/lib/jobs/social-kit-idempotency";

// ── Types ────────────────────────────────────────

interface OrchestrationInput {
  userId: string;
  imageUrl: string;
  locale?: string;
  projectId?: string;
}

interface SocialKitOrchestrationInput extends OrchestrationInput {
  /** Durable request claim required before any Social Kit paid side effect. */
  requestId: string;
}

interface OrchestrationResult {
  jobIds: string[];
  totalCost: number;
  estimatedTime: string;
  sceneCount?: number;
  hasVideo?: boolean;
  completedJobs?: number;
  warnings?: string[];
  submissionStates?: Record<string, ProviderSubmissionState>;
  /** At least one child did not return a provably terminal submission result. */
  reconciliationPending?: boolean;
}

// ── A+ Content (4 parallel scenes) ───────────────

export async function orchestrateAplus(
  input: OrchestrationInput
): Promise<OrchestrationResult> {
  const { userId, imageUrl, locale = "tr" } = input;

  const results = await Promise.allSettled(
    APLUS_SCENES.map((scene) =>
      submitJob({
        userId,
        tool: "aplus",
        imageUrl,
        prompt: getScenePrompt(scene.id, locale),
      })
    )
  );

  const jobIds: string[] = [];
  const warnings: string[] = [];
  const submissionStates: Record<string, ProviderSubmissionState> = {};

  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      jobIds.push(r.value.jobId);
      submissionStates[r.value.jobId] = r.value.submissionState;
      if (r.value.submissionState !== "accepted") {
        warnings.push(
          `Scene "${APLUS_SCENES[i].id}": ${r.value.warning ?? r.value.submissionState}`
        );
      }
    } else {
      const err = r.reason;
      const msg =
        err instanceof CreditError && err.code === "INSUFFICIENT"
          ? "insufficient credits"
          : err instanceof Error
          ? err.message
          : "failed";
      warnings.push(`Scene "${APLUS_SCENES[i].id}": ${msg}`);
    }
  });

  if (jobIds.length === 0) {
    throw new Error(warnings[0] || "All A+ scenes failed to submit");
  }

  return {
    jobIds,
    totalCost: jobIds.length * 8,
    estimatedTime: "~1min",
    submissionStates,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

// ── Talking Avatar (TTS → video pipeline) ────────

interface TalkingAvatarInput extends OrchestrationInput {
  /** Text script — will be converted to audio via TTS */
  script?: string;
  /** Pre-made audio URL — skip TTS if provided */
  audioUrl?: string;
}

export async function orchestrateTalkingAvatar(
  input: TalkingAvatarInput
): Promise<{
  jobId: string;
  requestId: string | null;
  creditCost: number;
  estimatedTime: string;
  submissionState: ProviderSubmissionState;
  warning?: string;
}> {
  const { userId, imageUrl, script, audioUrl } = input;

  // Ses süresi maliyeti belirler ($0.16/sn) — script sınırı zorunlu.
  if (script && script.length > MAX_AVATAR_SCRIPT_CHARS) {
    throw new Error(
      `Script too long (max ${MAX_AVATAR_SCRIPT_CHARS} characters)`
    );
  }

  if (!script && !audioUrl) {
    throw new Error("Either script or audioUrl is required for talking-avatar");
  }

  // submitJob owns the bundled reservation -> TTS -> video ordering so no
  // provider cost can occur before the user's credits are reserved.
  const result = await submitJob({
    userId,
    tool: "talking-avatar",
    imageUrl,
    script,
    audioUrl,
  });

  return {
    jobId: result.jobId,
    requestId: result.requestId,
    creditCost: result.creditCost,
    estimatedTime: result.estimatedTime,
    submissionState: result.submissionState,
    ...(result.warning ? { warning: result.warning } : {}),
  };
}

// ── Social Kit (4 scenes + 1 video) ──────────────

const SOCIAL_KIT_SCENE_PROMPTS = {
  tr: [
    "Profesyonel stüdyo ışıklarında, temiz beyaz arka planda e-ticaret ürün fotoğrafı, yüksek çözünürlük",
    "Yaşam tarzı sahnesi, ürün günlük kullanımda, doğal ışık, sıcak tonlar, lifestyle fotoğrafçılık",
    "Üst açıdan flat lay kompozisyon, ürün şık aksesuarlarla çevrili, minimalist düzen, Pinterest tarzı",
    "Mevsimsel tema, trendy arka plan, ürün ön planda, sosyal medya için optimize edilmiş kare format",
  ],
  en: [
    "Professional studio lighting, clean white background, e-commerce product photography, high resolution",
    "Lifestyle scene, product in everyday use, natural lighting, warm tones, lifestyle photography",
    "Top-down flat lay composition, product surrounded by elegant accessories, minimalist layout, Pinterest style",
    "Seasonal theme, trendy background, product in foreground, square format optimized for social media",
  ],
} as const;

export async function orchestrateSocialKit(
  input: SocialKitOrchestrationInput
): Promise<OrchestrationResult> {
  const { userId, imageUrl, locale = "tr", projectId, requestId } = input;
  if (!requestId) {
    throw new Error("social_kit_durable_request_required");
  }
  const prompts =
    SOCIAL_KIT_SCENE_PROMPTS[locale === "en" ? "en" : "tr"];

  if (prompts.length !== SOCIAL_KIT_SCENE_COUNT) {
    throw new Error("Social Kit scene configuration is inconsistent");
  }

  const sceneCost = MODELS[SOCIAL_KIT_SCENE_MODEL].creditCost;
  const videoCost = MODELS[SOCIAL_KIT_VIDEO_MODEL].creditCost;
  const jobs = [
    ...prompts.map((prompt, index) => ({
      kind: "scene" as const,
      prompt,
      modelKey: SOCIAL_KIT_SCENE_MODEL,
      creditCost: sceneCost,
      description: `social-kit — scene ${index + 1}/${SOCIAL_KIT_SCENE_COUNT}`,
    })),
    {
      kind: "video" as const,
      prompt:
        locale === "en"
          ? "Professional product showcase video with smooth camera movement, studio lighting"
          : "Yumuşak kamera hareketi ile profesyonel ürün tanıtım videosu, stüdyo ışıkları",
      modelKey: SOCIAL_KIT_VIDEO_MODEL,
      creditCost: videoCost,
      description: "social-kit — product video",
    },
  ];

  let userEmail: string | undefined;
  try {
    userEmail = (await createAdminClient().auth.admin.getUserById(userId)).data?.user?.email;
  } catch {
    // A failed admin lookup must not make a normal user free.
  }

  const reservationItems = jobs.map((job) => ({
    amount: job.creditCost,
    description: job.description,
  }));
  const reservations = isAdmin(userEmail)
    ? []
    : await reserveSocialKitRequestBundle({
        requestId,
        userId,
        items: reservationItems,
      });

  // Reserve the complete bundle before creating a project. A failed credit
  // claim must not leave an empty project behind.
  const resolvedProjectId =
    projectId ?? (await autoCreateProject(userId, "social-kit", imageUrl));

  const results = await Promise.allSettled(
    jobs.map((job, index) =>
      submitJob({
        userId,
        userEmail,
        projectId: resolvedProjectId,
        tool: job.kind,
        modelKey: job.modelKey,
        imageUrl,
        prompt: job.prompt,
        orchestrationRequestId: requestId,
        ...(reservations[index]
          ? {
              reservedCredit: {
                txId: reservations[index],
                amount: job.creditCost,
              },
            }
          : {}),
      })
    )
  );

  const jobIds: string[] = [];
  const warnings: string[] = [];
  const submissionStates: Record<string, ProviderSubmissionState> = {};
  let totalCost = 0;
  let reconciliationPending = false;

  const sceneResults = results.slice(0, SOCIAL_KIT_SCENE_COUNT);
  const videoResult = results[SOCIAL_KIT_SCENE_COUNT];

  sceneResults.forEach((r, i) => {
    if (r.status === "fulfilled") {
      jobIds.push(r.value.jobId);
      totalCost += r.value.creditCost;
      submissionStates[r.value.jobId] = r.value.submissionState;
      if (r.value.submissionState !== "accepted") {
        warnings.push(
          `Scene ${i + 1}: ${r.value.warning ?? r.value.submissionState}`
        );
      }
    } else {
      reconciliationPending = true;
      const err = r.reason;
      const msg =
        err instanceof CreditError && err.code === "INSUFFICIENT"
          ? "insufficient credits"
          : err instanceof Error
          ? err.message
          : "failed";
      warnings.push(`Scene ${i + 1}: ${msg}`);
    }
  });

  if (videoResult.status === "fulfilled") {
    jobIds.push(videoResult.value.jobId);
    totalCost += videoResult.value.creditCost;
    submissionStates[videoResult.value.jobId] = videoResult.value.submissionState;
    if (videoResult.value.submissionState !== "accepted") {
      warnings.push(
        `Video: ${videoResult.value.warning ?? videoResult.value.submissionState}`
      );
    }
  } else {
    reconciliationPending = true;
    warnings.push(
      `Video: ${videoResult.reason instanceof Error ? videoResult.reason.message : "failed"}`
    );
  }

  if (jobIds.length === 0) {
    throw new Error(warnings[0] || "All social-kit jobs failed to submit");
  }

  return {
    jobIds,
    totalCost,
    estimatedTime: "~3min",
    sceneCount: sceneResults.filter((result) => result.status === "fulfilled").length,
    hasVideo: videoResult.status === "fulfilled",
    completedJobs: jobIds.length,
    submissionStates,
    ...(reconciliationPending ? { reconciliationPending: true } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
