export type ModelTier = "fast" | "standard" | "premium";

export type ToolType = "3d-model" | "bg-remove" | "enhance" | "scene" | "video" | "aplus" | "image-edit" | "text-to-image" | "qr-code" | "talking-avatar" | "logo" | "social-kit";

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

  /* ── 3D Model — Çoklu Fotoğraf (Hızlı) ────── */
  "tripo-v25-mv": {
    id: "tripo3d/tripo/v2.5/multiview-to-3d",
    displayName: {
      tr: "Tripo 2.5 — Hızlı Çoklu",
      en: "Tripo 2.5 — Fast Multi",
    },
    tier: "fast",
    creditCost: 10,
    estimatedTime: "~30s",
    imageParamKey: "front_image_url",
    multiImage: true,
    namedImageParams: ["front_image_url", "left_image_url", "back_image_url", "right_image_url"],
    defaultParams: {
      texture: "standard",
      face_limit: 50000,
    },
  },

  /* ── 3D Model — Çoklu Fotoğraf (Kaliteli) ─── */
  "meshy-5-multi": {
    id: "fal-ai/meshy/v5/multi-image-to-3d",
    displayName: {
      tr: "Meshy 5 — Kaliteli Çoklu",
      en: "Meshy 5 — Quality Multi",
    },
    tier: "standard",
    creditCost: 15,
    estimatedTime: "~3min",
    imageParamKey: "image_urls",
    multiImage: true,
    defaultParams: {
      topology: "triangle",
      target_polycount: 50000,
      should_remesh: true,
      should_texture: true,
      enable_pbr: true,
      symmetry_mode: "auto",
    },
  },

  /* ── 3D Model — Hunyuan3D V3 (Video/4-Açı) ── */
  "hunyuan3d-v3": {
    id: "fal-ai/hunyuan3d-v3/image-to-3d",
    displayName: {
      tr: "Hunyuan3D V3 — Premium",
      en: "Hunyuan3D V3 — Premium",
    },
    tier: "premium",
    creditCost: 30,
    estimatedTime: "~3min",
    imageParamKey: "input_image_url",
    multiImage: true,
    namedImageParams: ["input_image_url", "left_image_url", "back_image_url", "right_image_url"],
    defaultParams: {
      enable_pbr: true,
      face_count: 500000,
      generate_type: "Normal",
    },
  },

  /* ── Görsel Düzenleme ─────────────────────── */
  "flux-kontext": {
    id: "fal-ai/flux-kontext/pro/v1",
    displayName: { tr: "FLUX Kontext — Düzenle", en: "FLUX Kontext — Edit" },
    tier: "standard",
    creditCost: 6,
    estimatedTime: "~10s",
    imageParamKey: "image_url",
    promptParamKey: "prompt",
    defaultParams: {
      guidance_scale: 4.0,
      num_inference_steps: 25,
      output_format: "png",
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

  /* ── Text-to-Image ───────────────────────── */
  "flux-pro": {
    id: "fal-ai/flux-pro/v1.1",
    displayName: { tr: "FLUX Pro — Kaliteli", en: "FLUX Pro — Quality" },
    tier: "standard",
    creditCost: 4,
    estimatedTime: "~10s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {
      width: 1024,
      height: 1024,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      output_format: "png",
    },
  },
  "flux-schnell": {
    id: "fal-ai/flux/schnell",
    displayName: { tr: "FLUX Schnell — Hızlı", en: "FLUX Schnell — Fast" },
    tier: "fast",
    creditCost: 2,
    estimatedTime: "~3s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {
      image_size: "square_hd",
      num_inference_steps: 4,
      output_format: "png",
    },
  },

  /* ── QR Code (AI Sanatsal) ─────────────────── */
  "qr-code-ai": {
    id: "fal-ai/flux-pro/v1.1",
    displayName: { tr: "AI Sanatsal QR", en: "AI Artistic QR" },
    tier: "standard",
    creditCost: 6,
    estimatedTime: "~10s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {
      width: 1024,
      height: 1024,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      output_format: "png",
    },
  },

  /* ── Konuşan Avatar ─────────────────────── */
  "omnihuman": {
    id: "fal-ai/omnihuman-v1-5",
    displayName: { tr: "OmniHuman — Konuşan Avatar", en: "OmniHuman — Talking Avatar" },
    tier: "standard",
    creditCost: 25,
    estimatedTime: "~2min",
    imageParamKey: "image_url",
    promptParamKey: "_unused",
    defaultParams: {
      resolution: 512,
    },
  },

  /* ── TTS (Text-to-Speech) — Konuşan Avatar yardımcı modeli */
  "f5-tts": {
    id: "fal-ai/f5-tts",
    displayName: { tr: "F5 TTS", en: "F5 TTS" },
    tier: "fast",
    creditCost: 0,
    estimatedTime: "~5s",
    imageParamKey: "_unused",
    promptParamKey: "gen_text",
    defaultParams: {
      model_type: "F5-TTS",
    },
  },

  /* ── Logo Üretimi ──────────────────────── */
  "recraft-v3": {
    id: "fal-ai/recraft-v3",
    displayName: { tr: "Recraft V3 — Logo", en: "Recraft V3 — Logo" },
    tier: "standard",
    creditCost: 8,
    estimatedTime: "~10s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {
      style: "vector_illustration",
      image_size: "square",
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
  "3d-model": ["trellis-v1", "tripo-v25-mv", "meshy-5-multi", "hunyuan3d-v3"],
  "bg-remove": ["birefnet"],
  "enhance": ["aura-sr"],
  "scene": ["bria-product-shot"],
  "video": ["wan-i2v"],
  "aplus": ["bria-product-shot-hd"],
  "image-edit": ["flux-kontext"],
  "text-to-image": ["flux-pro", "flux-schnell"],
  "qr-code": ["qr-code-ai"],
  "talking-avatar": ["omnihuman"],
  "logo": ["recraft-v3"],
  "social-kit": [], // Orchestration tool — uses scene + video internally
};

export const TOOL_KEYS: Record<ToolType, string> = {
  "3d-model": "3dModel",
  "bg-remove": "bgRemove",
  enhance: "enhance",
  scene: "scene",
  video: "video",
  aplus: "aplus",
  "image-edit": "imageEdit",
  "text-to-image": "textToImage",
  "qr-code": "qrCode",
  "talking-avatar": "talkingAvatar",
  "logo": "logo",
  "social-kit": "socialKit",
};

/**
 * Credit cost per tool — derived from the first (default) model's creditCost
 * to stay in sync with MODELS automatically.
 * A+ is overridden: 4 scenes × 8 credits = 32 credits total.
 */
export const TOOL_CREDITS: Record<ToolType, number> = {
  ...(Object.fromEntries(
    (Object.keys(TOOL_MODELS) as ToolType[])
      .filter((tool) => TOOL_MODELS[tool].length > 0)
      .map((tool) => [
        tool,
        MODELS[TOOL_MODELS[tool][0]].creditCost,
      ])
  ) as Record<ToolType, number>),
  aplus: 32,          // 4 scenes × 8 credits
  "social-kit": 40,   // 4 scenes (32) + 1 video (20) — package discount
};

/** Tools that accept a text prompt from the user */
export const TOOLS_WITH_PROMPT: ToolType[] = ["scene", "video", "image-edit", "text-to-image", "qr-code", "logo"];

/** Tools that DON'T need an image input (text-only) */
export const TOOLS_TEXT_ONLY: ToolType[] = ["text-to-image", "qr-code", "logo"];

/** Tools that accept multiple images (multi-view) */
export const TOOLS_MULTI_IMAGE: ToolType[] = ["3d-model"];

/** Max images for multi-image tools */
export const MAX_MULTI_IMAGES = 4;
