/**
 * Deterministic prompt backbones for the "smart prompt" system.
 *
 * Pure data + pure functions — safe to import from client (labels) or server.
 * The compose layer (src/lib/prompts/compose.ts, server-only) blends these
 * with the auto-detected product caption and the user's free-text via a small
 * LLM (hybrid). If the LLM is unavailable the deterministic output here is used
 * directly, so generation never breaks.
 */

export interface ScenePreset {
  label: string;
  /** English description of the target setting/background */
  setting: string;
  /** English lighting description */
  lighting: string;
}

export const SCENE_PRESETS: Record<string, ScenePreset> = {
  studio: { label: "Stüdyo", setting: "a clean seamless studio backdrop with a subtle floor reflection", lighting: "soft, even softbox lighting" },
  lifestyle: { label: "Yaşam Tarzı", setting: "a warm, natural lifestyle setting with tasteful complementary props", lighting: "soft directional window light" },
  outdoor: { label: "Dış Mekan", setting: "a bright natural outdoor setting with a gently blurred background", lighting: "soft natural daylight" },
  minimal: { label: "Minimalist", setting: "a minimal, uncluttered surface with generous negative space", lighting: "soft directional light" },
  luxury: { label: "Lüks", setting: "a premium polished marble or dark stone surface with elegant accents", lighting: "dramatic directional lighting with refined reflections" },
};

export const DEFAULT_SCENE_KEY = "studio";

export interface AplusPreset {
  label: string;
  layout: string;
}

export const APLUS_PRESETS: Record<string, AplusPreset> = {
  feature: { label: "Özellik Vurgulama", layout: "a clean feature-highlight layout with clear space for callout annotations" },
  comparison: { label: "Karşılaştırma", layout: "a side-by-side comparison composition on a neutral background" },
  lifestyle: { label: "Yaşam Tarzı", layout: "an aspirational lifestyle context showing the product in real use" },
  infographic: { label: "İnfografik", layout: "a clean infographic-style background with a clear focal area for text annotations" },
};

export const DEFAULT_APLUS_KEY = "feature";

/** Platform-specific background constraints for A+ content */
export const APLUS_PLATFORM_HINTS: Record<string, string> = {
  amazon: "on a pure white background (RGB 255,255,255), Amazon main-image compliant",
  trendyol: "on a clean catalog-ready background suitable for Trendyol",
  hepsiburada: "on a clean catalog-ready background suitable for Hepsiburada",
  n11: "on a clean catalog-ready background suitable for n11",
  custom: "on a clean professional background",
};

export const DEFAULT_PLATFORM_KEY = "custom";

export interface PromptContext {
  kind: "scene" | "aplus" | "image-edit";
  /** scene type key (SCENE_PRESETS) */
  sceneType?: string;
  /** A+ template key (APLUS_PRESETS) */
  template?: string;
  /** A+ platform key (APLUS_PLATFORM_HINTS) */
  platform?: string;
  /** image-edit action id (for context only) */
  action?: string;
  /** Product description from auto image-analysis (Florence-2 caption) */
  caption?: string;
}

/**
 * Build a deterministic English prompt backbone from the structured context.
 *
 * `isEdit` = the target model edits the uploaded product image (e.g. Nano Banana
 * Pro) and must be told to preserve the product. When false, the backbone
 * describes a scene/background for a product-shot model (e.g. Bria) that keeps
 * the product natively.
 */
export function buildBackbone(ctx: PromptContext, isEdit: boolean): string {
  if (ctx.kind === "scene") {
    const p = SCENE_PRESETS[ctx.sceneType ?? DEFAULT_SCENE_KEY] ?? SCENE_PRESETS[DEFAULT_SCENE_KEY];
    if (isEdit) {
      return `Place the product into ${p.setting}, ${p.lighting}. Preserve the product's exact shape, colors, materials, proportions and any label text. Photorealistic, high-detail e-commerce product photography. Do not alter the product itself.`;
    }
    return `${p.setting}, ${p.lighting}, professional e-commerce product photography, high detail`;
  }

  if (ctx.kind === "aplus") {
    const p = APLUS_PRESETS[ctx.template ?? DEFAULT_APLUS_KEY] ?? APLUS_PRESETS[DEFAULT_APLUS_KEY];
    const platform = APLUS_PLATFORM_HINTS[ctx.platform ?? DEFAULT_PLATFORM_KEY] ?? APLUS_PLATFORM_HINTS[DEFAULT_PLATFORM_KEY];
    if (isEdit) {
      return `Place the product into ${p.layout}, ${platform}. Preserve the product's exact shape, colors, materials, proportions and label text. Premium, high-end e-commerce catalog quality, professional studio lighting.`;
    }
    return `${p.layout}, ${platform}, premium high-end e-commerce catalog quality, professional studio lighting`;
  }

  // image-edit: the user's structured instruction carries the actual change;
  // this backbone only sets the quality/identity guardrails.
  return "Apply the requested edit while keeping the rest of the image, the product identity, lighting and perspective unchanged. Photorealistic, seamless result.";
}
