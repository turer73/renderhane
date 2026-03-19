export type ModelTier = "fast" | "standard" | "premium";

export type ToolType = "3d-model" | "bg-remove" | "enhance" | "scene" | "video" | "aplus";

export interface ModelConfig {
  id: string;
  displayName: { tr: string; en: string };
  tier: ModelTier;
  creditCost: number;
  estimatedTime: string;
  imageParamKey: string;
  /** Key used for the optional text prompt (e.g. scene_description, prompt) */
  promptParamKey?: string;
  /** When true, imageParamKey accepts a string[] instead of a single string */
  multiImage?: boolean;
  /** When set, multi-image input maps array positions to these named params instead of a single array key */
  namedImageParams?: string[];
  defaultParams: Record<string, unknown>;
}

export const MODELS: Record<string, ModelConfig> = {
  /* ── 3D Model — Tek Fotoğraf ────────────────── */
  "trellis-v1": {
    id: "fal-ai/trellis/multi",
    displayName: { tr: "TRELLIS v1 — Hızlı", en: "TRELLIS v1 — Fast" },
    tier: "fast",
    creditCost: 5,
    estimatedTime: "~15s",
    imageParamKey: "image_urls",
    multiImage: true,
    defaultParams: {
      ss_guidance_strength: 7.5,
      slat_guidance_strength: 5,
      mesh_simplify: 0.90,
      texture_size: 1024,
    },
  },
  "trellis-2": {
    id: "fal-ai/trellis-2/multi",
    displayName: { tr: "TRELLIS 2 — Kaliteli", en: "TRELLIS 2 — Quality" },
    tier: "standard",
    creditCost: 20,
    estimatedTime: "~2min",
    imageParamKey: "image_urls",
    multiImage: true,
    defaultParams: {
      resolution: 1024,
      ss_guidance_strength: 7.5,
      texture_size: 2048,
      remesh: true,
    },
  },

  /* ── 3D Model — Çoklu Fotoğraf ─────────────── */
  "hunyuan3d-v2-mv": {
    id: "fal-ai/hunyuan3d/v2/multi-view",
    displayName: {
      tr: "Hunyuan3D Multi-View",
      en: "Hunyuan3D Multi-View",
    },
    tier: "standard",
    creditCost: 25,
    estimatedTime: "~2min",
    imageParamKey: "front_image_url",
    multiImage: true,
    namedImageParams: ["front_image_url", "back_image_url", "left_image_url"],
    defaultParams: {
      num_inference_steps: 75,
      guidance_scale: 7.5,
      octree_resolution: 384,
      textured_mesh: true,
    },
  },

  /* ── Arka Plan Kaldır ─────────────────────── */
  "birefnet": {
    id: "fal-ai/birefnet/v2",
    displayName: { tr: "Arka Plan Kaldır", en: "Remove Background" },
    tier: "fast",
    creditCost: 1,
    estimatedTime: "~3s",
    imageParamKey: "image_url",
    defaultParams: {},
  },

  /* ── Görseli İyileştir ────────────────────── */
  "aura-sr": {
    id: "fal-ai/aura-sr",
    displayName: { tr: "Görseli İyileştir", en: "Enhance Image" },
    tier: "fast",
    creditCost: 4,
    estimatedTime: "~5s",
    imageParamKey: "image_url",
    defaultParams: {},
  },

  /* ── Sahne Üret ───────────────────────────── */
  "bria-product-shot": {
    id: "fal-ai/bria/product-shot",
    displayName: { tr: "Sahne Üretici", en: "Scene Generator" },
    tier: "fast",
    creditCost: 8,
    estimatedTime: "~10s",
    imageParamKey: "image_url",
    promptParamKey: "scene_description",
    defaultParams: {
      scene_description:
        "professional product photography on a clean marble surface with soft natural lighting",
    },
  },

  /* ── Video Oluştur ────────────────────────── */
  "wan-i2v": {
    id: "wan/v2.6/image-to-video",
    displayName: { tr: "Wan 2.6 Video", en: "Wan 2.6 Video" },
    tier: "standard",
    creditCost: 20,
    estimatedTime: "~2min",
    imageParamKey: "image_url",
    promptParamKey: "prompt",
    defaultParams: {
      prompt: "A smooth product showcase with gentle camera movement, professional lighting",
      resolution: "720p",
      duration: "5",
    },
  },

  /* ── A+ İçerik ────────────────────────────── */
  "bria-product-shot-hd": {
    id: "fal-ai/bria/product-shot",
    displayName: { tr: "A+ Sahne Üretici", en: "A+ Scene Generator" },
    tier: "standard",
    creditCost: 8,
    estimatedTime: "~15s",
    imageParamKey: "image_url",
    promptParamKey: "scene_description",
    defaultParams: {
      scene_description:
        "premium e-commerce product photography, lifestyle setting with elegant props, professional studio lighting, high-end catalog quality",
    },
  },
};

export const TOOL_MODELS: Record<ToolType, string[]> = {
  "3d-model": ["trellis-v1", "trellis-2", "hunyuan3d-v2-mv"],
  "bg-remove": ["birefnet"],
  "enhance": ["aura-sr"],
  "scene": ["bria-product-shot"],
  "video": ["wan-i2v"],
  "aplus": ["bria-product-shot-hd"],
};

export const TOOL_KEYS: Record<ToolType, string> = {
  "3d-model": "3dModel",
  "bg-remove": "bgRemove",
  enhance: "enhance",
  scene: "scene",
  video: "video",
  aplus: "aplus",
};

/**
 * Credit cost per tool — derived from the first (default) model's creditCost
 * to stay in sync with MODELS automatically.
 * A+ is overridden: 4 scenes × 8 credits = 32 credits total.
 */
export const TOOL_CREDITS: Record<ToolType, number> = {
  ...(Object.fromEntries(
    (Object.keys(TOOL_MODELS) as ToolType[]).map((tool) => [
      tool,
      MODELS[TOOL_MODELS[tool][0]].creditCost,
    ])
  ) as Record<ToolType, number>),
  aplus: 32, // 4 scenes × 8 credits
};

/** Tools that accept a text prompt from the user */
export const TOOLS_WITH_PROMPT: ToolType[] = ["scene", "video"];

/** Tools that accept multiple images (multi-view) */
export const TOOLS_MULTI_IMAGE: ToolType[] = ["3d-model"];

/** Max images for multi-image tools */
export const MAX_MULTI_IMAGES = 3;
