export type ModelTier = "fast" | "standard" | "premium";

export type ToolType = "3d-model" | "bg-remove" | "enhance" | "scene" | "video" | "aplus";

export interface ModelConfig {
  id: string;
  displayName: { tr: string; en: string };
  tier: ModelTier;
  creditCost: number;
  estimatedTime: string;
  imageParamKey: string;
  defaultParams: Record<string, unknown>;
}

export const MODELS: Record<string, ModelConfig> = {
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
  "birefnet": {
    id: "fal-ai/birefnet/v2",
    displayName: { tr: "Arka Plan Kaldır", en: "Remove Background" },
    tier: "fast",
    creditCost: 1,
    estimatedTime: "~3s",
    imageParamKey: "image_url",
    defaultParams: {},
  },
  "aura-sr": {
    id: "fal-ai/aura-sr",
    displayName: { tr: "Görseli İyileştir", en: "Enhance Image" },
    tier: "fast",
    creditCost: 2,
    estimatedTime: "~5s",
    imageParamKey: "image_url",
    defaultParams: {},
  },
};

export const TOOL_MODELS: Record<ToolType, string[]> = {
  "3d-model": ["trellis-v1", "trellis-2"],
  "bg-remove": ["birefnet"],
  "enhance": ["aura-sr"],
  "scene": [],
  "video": [],
  "aplus": [],
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
