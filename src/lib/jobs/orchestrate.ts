import { submitJob } from "@/lib/jobs/submit";
import { APLUS_SCENES, getScenePrompt } from "@/lib/fal/aplus-scenes";
import { MAX_AVATAR_SCRIPT_CHARS } from "@/lib/fal/models";
import { CreditError } from "@/lib/credits/engine";

// ── Types ────────────────────────────────────────

interface OrchestrationInput {
  userId: string;
  imageUrl: string;
  locale?: string;
}

interface OrchestrationResult {
  jobIds: string[];
  totalCost: number;
  estimatedTime: string;
  warnings?: string[];
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

  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      jobIds.push(r.value.jobId);
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
): Promise<{ jobId: string; creditCost: number; estimatedTime: string }> {
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
    creditCost: result.creditCost,
    estimatedTime: result.estimatedTime,
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
  input: OrchestrationInput
): Promise<OrchestrationResult> {
  const { userId, imageUrl, locale = "tr" } = input;
  const prompts =
    SOCIAL_KIT_SCENE_PROMPTS[locale === "en" ? "en" : "tr"];

  // Submit 4 scenes + 1 video in parallel
  const [sceneResults, videoResult] = await Promise.all([
    Promise.allSettled(
      prompts.map((scenePrompt) =>
        submitJob({
          userId,
          tool: "scene",
          imageUrl,
          prompt: scenePrompt,
        })
      )
    ),
    submitJob({
      userId,
      tool: "video",
      imageUrl,
      prompt:
        locale === "en"
          ? "Professional product showcase video with smooth camera movement, studio lighting"
          : "Yumuşak kamera hareketi ile profesyonel ürün tanıtım videosu, stüdyo ışıkları",
    }).catch((err) => ({ error: err as Error })),
  ]);

  const jobIds: string[] = [];
  const warnings: string[] = [];
  let totalCost = 0;

  sceneResults.forEach((r, i) => {
    if (r.status === "fulfilled") {
      jobIds.push(r.value.jobId);
      totalCost += r.value.creditCost;
    } else {
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

  if ("jobId" in videoResult) {
    jobIds.push(videoResult.jobId);
    totalCost += videoResult.creditCost;
  } else if ("error" in videoResult) {
    warnings.push(
      `Video: ${videoResult.error instanceof Error ? videoResult.error.message : "failed"}`
    );
  }

  if (jobIds.length === 0) {
    throw new Error(warnings[0] || "All social-kit jobs failed to submit");
  }

  return {
    jobIds,
    totalCost,
    estimatedTime: "~3min",
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
