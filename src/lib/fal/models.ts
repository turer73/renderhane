export type ModelTier = "fast" | "standard" | "premium";

export type ToolType = "3d-model" | "bg-remove" | "enhance" | "scene" | "video" | "aplus" | "image-edit" | "inpainting" | "object-removal" | "text-to-image" | "qr-code" | "talking-avatar" | "logo" | "social-kit" | "virtual-tryon";

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

  /* ── 3D Model — Hyper3D Rodin (Premium) ───── */
  "hyper3d-rodin": {
    id: "fal-ai/hyper3d/rodin",
    displayName: {
      tr: "Rodin — Premium 3D",
      en: "Rodin — Premium 3D",
    },
    tier: "premium",
    creditCost: 35,
    estimatedTime: "~2min",
    imageParamKey: "input_image_urls",
    multiImage: true,
    defaultParams: {
      geometry_file_format: "glb",
      material: "PBR",
      quality_mesh_option: "500K Triangle",
    },
  },

  /* ── 3D Model — Hunyuan3D V3 (4-Açı) ──────── */
  "hunyuan3d-v3": {
    id: "fal-ai/hunyuan3d-v3/image-to-3d",
    displayName: {
      tr: "Hunyuan3D V3",
      en: "Hunyuan3D V3",
    },
    tier: "standard",
    creditCost: 20,
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

  /* ── 3D Model — Hunyuan3D V3.1 Pro (8-Açı, Premium) ── */
  "hunyuan3d-v31-pro": {
    id: "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
    displayName: {
      tr: "Hunyuan3D V3.1 Pro — 8K PBR",
      en: "Hunyuan3D V3.1 Pro — 8K PBR",
    },
    tier: "premium",
    creditCost: 40,
    estimatedTime: "~4min",
    imageParamKey: "input_image_url",
    multiImage: true,
    namedImageParams: [
      "input_image_url", "left_image_url", "back_image_url", "right_image_url",
      "top_image_url", "bottom_image_url", "left_front_image_url", "right_front_image_url",
    ],
    defaultParams: {
      enable_pbr: true,
      face_count: 1000000,
      generate_type: "Normal",
    },
  },

  /* ── 3D Model — Meshy 6 Text-to-3D (Rigging + Animasyon) ── */
  "meshy-6-text": {
    id: "fal-ai/meshy/v6/text-to-3d",
    displayName: {
      tr: "Meshy 6 — Metin → 3D + Animasyon",
      en: "Meshy 6 — Text → 3D + Animation",
    },
    tier: "standard",
    creditCost: 22,
    estimatedTime: "~2min",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {
      mode: "full",
      art_style: "realistic",
      topology: "triangle",
      target_polycount: 30000,
      should_remesh: true,
      enable_pbr: true,
      symmetry_mode: "auto",
    },
  },

  /* ── 3D Model — Meshy 6 Image-to-3D ──────── */
  "meshy-6-image": {
    id: "fal-ai/meshy/v6/image-to-3d",
    displayName: {
      tr: "Meshy 6 — Foto → 3D",
      en: "Meshy 6 — Image → 3D",
    },
    tier: "standard",
    creditCost: 18,
    estimatedTime: "~2min",
    imageParamKey: "image_url",
    defaultParams: {
      topology: "triangle",
      target_polycount: 30000,
      should_remesh: true,
      enable_pbr: true,
      symmetry_mode: "auto",
    },
  },

  /* ── 3D Model — TripoSR Hızlı Önizleme ──── */
  "triposr": {
    id: "fal-ai/triposr",
    displayName: {
      tr: "TripoSR — Anlık Önizleme",
      en: "TripoSR — Instant Preview",
    },
    tier: "fast",
    creditCost: 3,
    estimatedTime: "~1s",
    imageParamKey: "image_url",
    defaultParams: {
      mc_resolution: 256,
      output_format: "glb",
    },
  },

  /* ── Görsel Düzenleme ─────────────────────── */
  "flux-kontext": {
    id: "fal-ai/flux-pro/kontext",
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

  /* ── Görsel Düzenleme — Premium ────────────── */
  "flux-kontext-max": {
    id: "fal-ai/flux-pro/kontext/max",
    displayName: { tr: "FLUX Kontext Max — Premium", en: "FLUX Kontext Max — Premium" },
    tier: "premium",
    creditCost: 10,
    estimatedTime: "~15s",
    imageParamKey: "image_url",
    promptParamKey: "prompt",
    defaultParams: {
      guidance_scale: 3.5,
      output_format: "png",
    },
  },

  /* ── Inpainting (FLUX Fill) ──────────────── */
  "flux-fill": {
    id: "fal-ai/flux-pro/v1/fill",
    displayName: { tr: "FLUX Fill — Inpainting", en: "FLUX Fill — Inpainting" },
    tier: "standard",
    creditCost: 6,
    estimatedTime: "~10s",
    imageParamKey: "image_url",
    promptParamKey: "prompt",
    defaultParams: {
      output_format: "png",
    },
  },

  /* ── Arka Plan Kaldır ─────────────────────── */
  "birefnet": {
    id: "fal-ai/birefnet/v2",
    displayName: { tr: "BiRefNet — Hassas", en: "BiRefNet — Precise" },
    tier: "fast",
    creditCost: 1,
    estimatedTime: "~3s",
    imageParamKey: "image_url",
    defaultParams: {},
  },
  "bria-rmbg": {
    id: "fal-ai/bria/background/remove",
    displayName: { tr: "Bria RMBG 2.0 — Ticari", en: "Bria RMBG 2.0 — Commercial" },
    tier: "fast",
    creditCost: 1,
    estimatedTime: "~3s",
    imageParamKey: "image_url",
    defaultParams: {},
  },

  /* ── Virtual Try-On (Kıyafet Giydirme) ──── */
  "fashn-tryon": {
    id: "fal-ai/fashn/tryon/v1.6",
    displayName: { tr: "FASHN — Kıyafet Giydirme", en: "FASHN — Virtual Try-On" },
    tier: "standard",
    creditCost: 10,
    estimatedTime: "~15s",
    imageParamKey: "model_image",
    multiImage: true,
    namedImageParams: ["model_image", "garment_image"],
    defaultParams: {
      category: "auto",
      mode: "quality",
      garment_photo_type: "auto",
      segmentation_free: true,
      output_format: "png",
    },
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

  /* ── Nesne Silme ──────────────────────────── */
  "object-removal": {
    id: "fal-ai/object-removal",
    displayName: { tr: "Nesne Silme", en: "Object Removal" },
    tier: "fast",
    creditCost: 3,
    estimatedTime: "~5s",
    imageParamKey: "image_url",
    promptParamKey: "prompt",
    defaultParams: {
      model: "best_quality",
      mask_expansion: 15,
    },
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
    displayName: { tr: "Wan 2.6 — Görsel→Video", en: "Wan 2.6 — Image→Video" },
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
  "kling-t2v": {
    id: "fal-ai/kling-video/v3/pro/text-to-video",
    displayName: { tr: "Kling 3.0 Pro — Metin→Video", en: "Kling 3.0 Pro — Text→Video" },
    tier: "standard",
    creditCost: 25,
    estimatedTime: "~2min",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {
      duration: "5",
      aspect_ratio: "16:9",
      generate_audio: true,
    },
  },
  "kling-i2v": {
    id: "fal-ai/kling-video/v3/pro/image-to-video",
    displayName: { tr: "Kling 3.0 Pro — Görsel→Video", en: "Kling 3.0 Pro — Image→Video" },
    tier: "standard",
    creditCost: 25,
    estimatedTime: "~2min",
    imageParamKey: "start_image_url",
    promptParamKey: "prompt",
    defaultParams: {
      duration: "5",
      generate_audio: true,
    },
  },

  /* ── Text-to-Image ───────────────────────── */
  "flux-pro": {
    id: "fal-ai/flux-2-pro",
    displayName: { tr: "FLUX 2 Pro — En Kaliteli", en: "FLUX 2 Pro — Best Quality" },
    tier: "standard",
    creditCost: 4,
    estimatedTime: "~8s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {
      image_size: "square_hd",
      num_inference_steps: 28,
      guidance_scale: 7.5,
      output_format: "png",
    },
  },
  "flux-dev": {
    id: "fal-ai/flux-2",
    displayName: { tr: "FLUX 2 Dev — Dengeli", en: "FLUX 2 Dev — Balanced" },
    tier: "standard",
    creditCost: 3,
    estimatedTime: "~6s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {
      image_size: "square_hd",
      num_inference_steps: 28,
      guidance_scale: 2.5,
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
    id: "fal-ai/flux-2-pro",
    displayName: { tr: "AI Sanatsal QR", en: "AI Artistic QR" },
    tier: "standard",
    creditCost: 6,
    estimatedTime: "~10s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {
      image_size: "square_hd",
      num_inference_steps: 28,
      guidance_scale: 7.5,
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
  "recraft-v4": {
    id: "fal-ai/recraft/v4/text-to-image",
    displayName: { tr: "Recraft V4 — Logo", en: "Recraft V4 — Logo" },
    tier: "standard",
    creditCost: 8,
    estimatedTime: "~10s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {
      image_size: "square_hd",
    },
  },
  "recraft-v4-svg": {
    id: "fal-ai/recraft/v4/text-to-vector",
    displayName: { tr: "Recraft V4 — SVG Vektör", en: "Recraft V4 — SVG Vector" },
    tier: "standard",
    creditCost: 10,
    estimatedTime: "~12s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {
      image_size: "square_hd",
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
  "3d-model": ["triposr", "trellis-v1", "trellis-2", "meshy-6-image", "meshy-6-text", "tripo-v25-mv", "hunyuan3d-v3", "hunyuan3d-v31-pro", "hyper3d-rodin"],
  "bg-remove": ["bria-rmbg", "birefnet"],
  "enhance": ["aura-sr"],
  "scene": ["bria-product-shot"],
  "video": ["wan-i2v", "kling-t2v", "kling-i2v"],
  "aplus": ["bria-product-shot-hd"],
  "image-edit": ["flux-kontext", "flux-kontext-max"],
  "inpainting": ["flux-fill"],
  "object-removal": ["object-removal"],
  "text-to-image": ["flux-pro", "flux-dev", "flux-schnell"],
  "qr-code": ["qr-code-ai"],
  "talking-avatar": ["omnihuman"],
  "logo": ["recraft-v4", "recraft-v4-svg"],
  "social-kit": [], // Orchestration tool — uses scene + video internally
  "virtual-tryon": ["fashn-tryon"],
};

export const TOOL_KEYS: Record<ToolType, string> = {
  "3d-model": "3dModel",
  "bg-remove": "bgRemove",
  enhance: "enhance",
  scene: "scene",
  video: "video",
  aplus: "aplus",
  "image-edit": "imageEdit",
  inpainting: "inpainting",
  "object-removal": "objectRemoval",
  "text-to-image": "textToImage",
  "qr-code": "qrCode",
  "talking-avatar": "talkingAvatar",
  logo: "logo",
  "social-kit": "socialKit",
  "virtual-tryon": "virtualTryon",
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
export const TOOLS_WITH_PROMPT: ToolType[] = ["scene", "video", "image-edit", "inpainting", "object-removal", "text-to-image", "qr-code", "logo"];

/** Tools that DON'T need an image input (text-only) */
export const TOOLS_TEXT_ONLY: ToolType[] = ["text-to-image", "qr-code", "logo"];

/** Tools that accept multiple images (multi-view or dual-input) */
export const TOOLS_MULTI_IMAGE: ToolType[] = ["3d-model", "virtual-tryon"];

/** Max images for multi-image tools */
export const MAX_MULTI_IMAGES = 4;
