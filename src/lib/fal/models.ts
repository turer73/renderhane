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
  defaultParams: Record<string, unknown>;
}

export const MODELS: Record<string, ModelConfig> = {
  /* ── 3D Model ─────────────────────────────── */
  "trellis-v1": {
    id: "fal-ai/trellis",
    displayName: { tr: "TRELLIS v1 — Hızlı", en: "TRELLIS v1 — Fast" },
    tier: "fast",
    creditCost: 2,
    estimatedTime: "~15s",
    imageParamKey: "image_url",
    defaultParams: {
      ss_guidance_strength: 7.5,
      slat_guidance_strength: 3,
      mesh_simplify: 0.95,
      texture_size: 1024,
    },
  },
  "trellis-2": {
    id: "fal-ai/trellis-2",
    displayName: { tr: "TRELLIS 2 — Kaliteli", en: "TRELLIS 2 — Quality" },
    tier: "standard",
    creditCost: 10,
    estimatedTime: "~2min",
    imageParamKey: "image_url",
    defaultParams: {
      resolution: 1024,
      ss_guidance_strength: 7.5,
      texture_size: 2048,
      remesh: true,
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
    creditCost: 2,
    estimatedTime: "~5s",
    imageParamKey: "image_url",
    defaultParams: {},
  },

  /* ── Sahne Üret ───────────────────────────── */
  "bria-product-shot": {
    id: "fal-ai/bria/product-shot",
    displayName: { tr: "Sahne Üretici", en: "Scene Generator" },
    tier: "fast",
    creditCost: 3,
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
    creditCost: 10,
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
    creditCost: 5,
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
  "3d-model": ["trellis-v1", "trellis-2"],
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

export const TOOL_CREDITS: Record<ToolType, number> = {
  "3d-model": 10,
  "bg-remove": 1,
  "enhance": 2,
  "scene": 3,
  "video": 10,
  "aplus": 5,
};

/** Tools that accept a text prompt from the user */
export const TOOLS_WITH_PROMPT: ToolType[] = ["scene", "video", "aplus"];
