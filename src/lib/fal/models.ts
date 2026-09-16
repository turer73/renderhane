export type ModelTier = "fast" | "standard" | "premium";

export type ToolType = "3d-model" | "bg-remove" | "enhance" | "scene" | "video" | "aplus" | "image-edit" | "inpainting" | "object-removal" | "text-to-image" | "qr-code" | "talking-avatar" | "logo" | "social-kit" | "virtual-tryon" | "srt-voiceover";

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
  /**
   * Admin-lab only: hidden from workspace pickers, blocked in public submit
   * paths for non-admins. Used to trial new fal endpoints before pricing
   * them into the product. Scanner still covers them via TOOL_MODELS.
   */
  adminOnly?: boolean;
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
    // fal: $0.3 standart doku + $0.05/ek-görünüm (~$0.45 4-açı) → 10kr zararına satıyordu
    creditCost: 30,
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
    id: "fal-ai/hyper3d/rodin/v2.5",
    displayName: {
      tr: "Rodin Gen-2.5 — Premium 3D",
      en: "Rodin Gen-2.5 — Premium 3D",
    },
    tier: "premium",
    creditCost: 35,
    estimatedTime: "~2min",
    // fal-ai/hyper3d/rodin/v2.5 girdi alanı `image_urls` (dizi). Önceki
    // `input_image_urls` yanlıştı → fal "At least one input image is required"
    // validation hatası veriyordu (image_urls boş kalıyordu).
    imageParamKey: "image_urls",
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
    creditCost: 28, // fal: $0.375/üretim
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
    creditCost: 55, // Meshy v6 fal: $0.8/üretim (full mode)
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

  /* ── 3D Model — Meshy 6 Image-to-3D ────────
     2026-07: v6-preview mezun oldu → kalıcı v6 endpoint'i. v6 şemasında
     symmetry_mode yok (preview'a özeldi), kaldırıldı. */
  "meshy-6-image": {
    id: "fal-ai/meshy/v6/image-to-3d",
    displayName: {
      tr: "Meshy 6 — Foto → 3D",
      en: "Meshy 6 — Image → 3D",
    },
    tier: "standard",
    creditCost: 55, // fal: $0.8/üretim — 18kr zararına satıyordu
    estimatedTime: "~2min",
    imageParamKey: "image_url",
    defaultParams: {
      topology: "triangle",
      target_polycount: 30000,
      should_remesh: true,
      enable_pbr: true,
    },
  },

  /* ── 3D Model — Meshy 7 (2026-09 doğrulandı) ──
     fal $1.20/textured (~₺58) → 80kr. Hizalama SOTA; ultra-mode kapalı
     (tek-görünüm kısıtı). Çıktı model_glb (webhook + sync destekli). */
  "meshy-v7": {
    id: "meshy/v7/image-to-3d",
    displayName: {
      tr: "Meshy 7 — Premium 3D",
      en: "Meshy 7 — Premium 3D",
    },
    tier: "premium",
    creditCost: 80,
    estimatedTime: "~3min",
    imageParamKey: "image_url",
    defaultParams: {
      should_texture: true,
      topology: "triangle",
      target_polycount: 30000,
    },
  },

  /* ── 3D Model — Tripo H3.1 LAB (2026-09 doğrulandı) ──
     Detay amirali (500K poly). Çıktı model_mesh (mevcut hat destekler).
     Fiyat sayfası opak → 45kr geçici, teyit edilecek. */
  "tripo-h31": {
    id: "tripo3d/h3.1/image-to-3d",
    displayName: { tr: "Tripo H3.1 (LAB)", en: "Tripo H3.1 (LAB)" },
    tier: "premium",
    creditCost: 45,
    estimatedTime: "~3min",
    imageParamKey: "image_url",
    adminOnly: true,
    defaultParams: {
      texture: "standard",
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
    creditCost: 4,
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

  /* ── Görsel Düzenleme / Sahne — Nano Banana Pro (Gemini 3 Pro Image) ──
     Ürün fotoğrafçılığı benchmark #1. Maskesiz doğal-dil düzenleme,
     etiket/ambalaj metni kusursuz, ürün tutarlılığı, 2K ekstra ücretsiz.
     Tek model hem image-edit hem scene aracına hizmet eder. */
  "nano-banana-pro-edit": {
    id: "fal-ai/nano-banana-pro/edit",
    displayName: { tr: "Nano Banana Pro — En Kaliteli", en: "Nano Banana Pro — Best Quality" },
    tier: "premium",
    creditCost: 18,
    estimatedTime: "~20s",
    imageParamKey: "image_urls",
    multiImage: true,
    promptParamKey: "prompt",
    defaultParams: {
      num_images: 1,
      resolution: "2K",
      aspect_ratio: "auto",
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
    id: "fal-ai/wan/v2.7/image-to-video",
    displayName: { tr: "Wan 2.7 — Görsel→Video", en: "Wan 2.7 — Image→Video" },
    tier: "standard",
    creditCost: 35, // fal: $0.10/sn @720p → 5sn $0.50 — 20kr zararına satıyordu
    estimatedTime: "~2min",
    imageParamKey: "image_url",
    promptParamKey: "prompt",
    defaultParams: {
      prompt: "A smooth product showcase with gentle camera movement, professional lighting",
      resolution: "720p",
      duration: "5",
    },
  },
  /* ── Video — Wan 3.0 (2026-09 doğrulandı) ──
     fal $0.10/sn @720p sesli → 5sn $0.50 (~₺24) → 40kr. duration/resolution
     pinli (şema default 1080p + akıllı-süre = maliyet patlaması yapar).
     Girdi anahtarı start_image_url. Çıktı {video, duration}. */
  "wan-3": {
    id: "alibaba/wan-3.0/image-to-video",
    displayName: { tr: "Wan 3.0 — Sesli Video", en: "Wan 3.0 — Video+Audio" },
    tier: "premium",
    creditCost: 40,
    estimatedTime: "~2min",
    imageParamKey: "start_image_url",
    promptParamKey: "prompt",
    defaultParams: {
      prompt: "A smooth product showcase with gentle camera movement, professional lighting",
      duration: 5,
      resolution: "720p",
      audio: true,
      aspect_ratio: "adaptive",
    },
  },
  /* ── Video — MiniMax H3 Max LAB (2026-09 doğrulandı) ──
     Hız × maliyet lideri (5sn ~2.5sn üretim). 768P pinli:
     $0.08/sn × 5sn = $0.40 → 30kr. prompt_expansion_mode ZORUNLU (şema). */
  "minimax-h3-max": {
    id: "minimax/h3-max/image-to-video",
    displayName: { tr: "MiniMax H3 Max (LAB)", en: "MiniMax H3 Max (LAB)" },
    tier: "premium",
    creditCost: 30,
    estimatedTime: "~1min",
    imageParamKey: "image_url",
    promptParamKey: "prompt",
    adminOnly: true,
    defaultParams: {
      duration: 5,
      resolution: "768P",
      prompt_expansion_mode: "balanced",
    },
  },

  /* ── Video — Seedance 2.5 LAB (2026-09 doğrulandı) ──
     30sn + referans yığını, ama pahalı: 5sn 720p ≈ $2.31 → 150kr.
     duration STRING enum ("5"), auto bırakılırsa model seçer (maliyet riski). */
  "seedance-25": {
    id: "bytedance/seedance-2.5/text-to-video",
    displayName: { tr: "Seedance 2.5 (LAB)", en: "Seedance 2.5 (LAB)" },
    tier: "premium",
    creditCost: 150,
    estimatedTime: "~3min",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    adminOnly: true,
    defaultParams: {
      duration: "5",
      resolution: "720p",
    },
  },

  /* ── Video — Happy Horse v1.1 LAB (2026-09 doğrulandı) ──
     Metinden konuşan video, TR lip-sync iddialı. 5sn 720p $0.70 → 45kr.
     resolution default 1080p idi — 720p pinli. */
  "happy-horse-v11": {
    id: "alibaba/happy-horse/v1.1/text-to-video",
    displayName: { tr: "Happy Horse (LAB)", en: "Happy Horse (LAB)" },
    tier: "standard",
    creditCost: 45,
    estimatedTime: "~2min",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    adminOnly: true,
    defaultParams: {
      duration: 5,
      resolution: "720p",
    },
  },
  /* Kling v3 girişleri TOOL_MODELS'te değil (O3 halefleri listede) ama API v1
     modelKey ile hâlâ seçilebilir — kredi/ses ayarı gerçek maliyete göre:
     fal $0.112/sn sessiz (sesli $0.168/sn → 5sn $0.84, 25kr zararına satıyordu). */
  "kling-t2v": {
    id: "fal-ai/kling-video/v3/pro/text-to-video",
    displayName: { tr: "Kling 3.0 Pro — Metin→Video", en: "Kling 3.0 Pro — Text→Video" },
    tier: "standard",
    creditCost: 40,
    estimatedTime: "~2min",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {
      duration: "5",
      aspect_ratio: "16:9",
      generate_audio: false,
    },
  },
  "kling-i2v": {
    id: "fal-ai/kling-video/v3/pro/image-to-video",
    displayName: { tr: "Kling 3.0 Pro — Görsel→Video", en: "Kling 3.0 Pro — Image→Video" },
    tier: "standard",
    creditCost: 40,
    estimatedTime: "~2min",
    imageParamKey: "start_image_url",
    promptParamKey: "prompt",
    defaultParams: {
      duration: "5",
      generate_audio: false,
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

  /* ── Text-to-Image — Nano Banana Pro (Gemini 3 Pro Image) ──
     Sıfırdan görsel üretiminde en kaliteli; etiket/ambalaj metni kusursuz,
     akıl-yürütmeli kompozisyon, 2K ekstra ücretsiz. */
  "nano-banana-pro": {
    id: "fal-ai/nano-banana-pro",
    displayName: { tr: "Nano Banana Pro — En Kaliteli", en: "Nano Banana Pro — Best Quality" },
    tier: "premium",
    creditCost: 18,
    estimatedTime: "~12s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {
      num_images: 1,
      resolution: "2K",
      aspect_ratio: "1:1",
      output_format: "png",
    },
  },

  /* ── QR Code (AI Sanatsal) ─────────────────── */
  "qr-code-ai": {
    // ControlNet pattern-conditioned diffusion (Monster Labs QR). The control
    // image is a real QR matrix generated server-side in submitJob; this model
    // stylizes it into scannable art. (Old "fal-ai/qr-codes" did not exist.)
    id: "fal-ai/illusion-diffusion",
    displayName: { tr: "AI Sanatsal QR", en: "AI Artistic QR" },
    tier: "standard",
    creditCost: 6,
    estimatedTime: "~15s",
    imageParamKey: "image_url",
    promptParamKey: "prompt",
    defaultParams: {
      image_size: "square_hd",
      num_inference_steps: 40,
      guidance_scale: 7.5,
      controlnet_conditioning_scale: 1.5, // high → QR stays scannable after stylization
    },
  },

  /* ── Konuşan Avatar ─────────────────────── */
  "omnihuman": {
    id: "fal-ai/bytedance/omnihuman/v1.5",
    displayName: { tr: "OmniHuman — Konuşan Avatar", en: "OmniHuman — Talking Avatar" },
    tier: "standard",
    // fal: $0.16/sn — maliyet SES UZUNLUĞUYLA orantılı. ~10sn varsayımıyla
    // $1.60; script MAX_AVATAR_SCRIPT_CHARS ile sınırlanır (aşağıda).
    creditCost: 100,
    estimatedTime: "~2min",
    imageParamKey: "image_url",
    promptParamKey: "_unused",
    defaultParams: {
      resolution: "1080p",
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

  /* ── SRT Seslendirme — MiniMax Speech-02 HD (doğal, Türkçe destekli) ──
     ESKİ varsayılan; kayıtlarda duruyor. Yeni varsayılan 2.8 HD. */
  "minimax-speech-02-hd": {
    id: "fal-ai/minimax/speech-02-hd",
    displayName: { tr: "MiniMax 02 — SRT Seslendirme", en: "MiniMax 02 — SRT Voiceover" },
    tier: "standard",
    creditCost: 4,
    estimatedTime: "~30s",
    imageParamKey: "_unused",
    promptParamKey: "text",
    defaultParams: {
      output_format: "url",
      language_boost: "Turkish",
      audio_setting: {
        format: "mp3",
        sample_rate: 44100,
        channel: 1,
      },
    },
  },

  /* ── SRT Seslendirme — MiniMax Speech-2.8 HD (2026-09 doğrulandı) ──
     fal $0.1/1k karakter (02-HD ile aynı fiyat). Girdi anahtarı "prompt"
     (02'deki "text" DEĞİL). Çıktı {audio:{url}, duration_ms} aynı.
     voice_setting/audio_setting/language_boost şeması 02 ile aynı. */
  "minimax-speech-28-hd": {
    id: "fal-ai/minimax/speech-2.8-hd",
    displayName: { tr: "MiniMax 2.8 — SRT Seslendirme", en: "MiniMax 2.8 — SRT Voiceover" },
    tier: "standard",
    creditCost: 4,
    estimatedTime: "~30s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {
      output_format: "url",
      language_boost: "Turkish",
      audio_setting: {
        format: "mp3",
        sample_rate: 44100,
        channel: 1,
      },
    },
  },

  /* ── TTS LAB — MiniMax Speech-2.8 Turbo (2026-09 doğrulandı) ──
     2.8 HD ile aynı şema (prompt). $0.06/1K → 2kr. SRT motor adayı. */
  "minimax-28-turbo": {
    id: "fal-ai/minimax/speech-2.8-turbo",
    displayName: { tr: "MiniMax 2.8 Turbo (LAB)", en: "MiniMax 2.8 Turbo (LAB)" },
    tier: "fast",
    creditCost: 2,
    estimatedTime: "~15s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    adminOnly: true,
    defaultParams: {
      output_format: "url",
      language_boost: "Turkish",
      audio_setting: {
        format: "mp3",
        sample_rate: 44100,
        channel: 1,
      },
    },
  },

  /* ── TTS LAB — ElevenLabs v3 (2026-09 doğrulandı) ──
     Doğallık lideri adayı ($0.10/1K → 4kr). voice serbest metin
     (Rachel varsayılan), language_code ISO ("tr" pinli, TR teyitsiz).
     Çıktı {audio} (duration YOK). */
  "eleven-v3": {
    id: "fal-ai/elevenlabs/tts/eleven-v3",
    displayName: { tr: "ElevenLabs v3 (LAB)", en: "ElevenLabs v3 (LAB)" },
    tier: "standard",
    creditCost: 4,
    estimatedTime: "~30s",
    imageParamKey: "_unused",
    promptParamKey: "text",
    adminOnly: true,
    defaultParams: {
      voice: "Rachel",
      language_code: "tr",
    },
  },
  /* ── TTS ekonomi motoru — xAI TTS (2026-09 doğrulandı) ──
     fal $0.015/1K (~₺0.0075/500krktr) → 1kr taban. language:"tr" pinli.
     Çıktı {audio} (duration_ms YOK → hız sığdırma çalışmaz).
     SRT economy modunda kullanılır; avatar amiral gemisi MiniMax'te kalır. */
  "xai-tts": {
    id: "xai/tts/v1",
    displayName: { tr: "xAI — Ekonomi Ses", en: "xAI — Economy Voice" },
    tier: "fast",
    creditCost: 1,
    estimatedTime: "~10s",
    imageParamKey: "_unused",
    promptParamKey: "text",
    defaultParams: {
      language: "tr",
    },
  },

  /* ── Logo Üretimi ──────────────────────── */
  "recraft-v4": {
    id: "fal-ai/recraft/v4.1/text-to-image",
    displayName: { tr: "Recraft V4.1 — Logo", en: "Recraft V4.1 — Logo" },
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
    id: "fal-ai/recraft/v4.1/text-to-vector",
    displayName: { tr: "Recraft V4.1 — SVG Vektör", en: "Recraft V4.1 — SVG Vector" },
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
    // Same bria endpoint as the standard scene tool, but a GENUINE HD upgrade:
    // shot_size forces a higher output resolution (1280x1280 ~= 1.64 MP vs the
    // standard scene's ~1 MP default) and fast:false picks the quality (not
    // speed) path. This makes the A+ "HD" label real — previously both used
    // identical params (#605).
    id: "fal-ai/bria/product-shot",
    displayName: { tr: "A+ Sahne Üretici", en: "A+ Scene Generator" },
    tier: "standard",
    creditCost: 8,
    estimatedTime: "~20s",
    imageParamKey: "image_url",
    promptParamKey: "scene_description",
    defaultParams: {
      scene_description:
        "premium e-commerce product photography, lifestyle setting with elegant props, professional studio lighting, high-end catalog quality",
      shot_size: [1280, 1280],
      fast: false,
    },
  },

  /* ════════════════════════════════════════════════════════════
     2026-06 fal.ai katalog güncellemesi — yeni / üst-kalite modeller.
     Tümü FAL_KEY ile endpoint-varlık + zorunlu-input şeması doğrulandı.
     creditCost değerleri fal.ai USD fiyatına göre tahmini — kâr marjına
     göre gözden geçirilmeli.
     ════════════════════════════════════════════════════════════ */

  /* ── Görseli İyileştir — Recraft Crisp Upscale ──
     fal.ai kendi karşılaştırmasında gerçek ürün fotoğrafı detayı +
     etiket metni koruma #1; aura-sr'den daha iyi ve çok ucuz. */
  "recraft-crisp-upscale": {
    id: "fal-ai/recraft/upscale/crisp",
    displayName: { tr: "Recraft Crisp — Net İyileştirme", en: "Recraft Crisp — Sharp Upscale" },
    tier: "fast",
    creditCost: 3,
    estimatedTime: "~6s",
    imageParamKey: "image_url",
    defaultParams: {},
  },

  /* ── Text-to-Image — Nano Banana 2 (Gemini 3.1 Flash Image) ──
     Nano Banana Pro'nun ~yarı fiyatı, 2-3x daha hızlı; çoklu-dil tipografi.
     Yüksek hacimli ürün görseli için varsayılan kalite seçeneği. */
  "nano-banana-2": {
    id: "fal-ai/nano-banana-2",
    displayName: { tr: "Nano Banana 2 — Hızlı Kalite", en: "Nano Banana 2 — Fast Quality" },
    tier: "standard",
    creditCost: 10,
    estimatedTime: "~6s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {
      num_images: 1,
      output_format: "png",
    },
  },

  /* ── Text-to-Image — Qwen Image 3 (2026-09 doğrulandı) ──
     Çok-dilli tipografi uzmanı (TR dahil 12 dil, ~10px'e kadar net yazı).
     fal $0.04 (1K) / $0.075 (2K) → 5kr. Girdi: prompt + image_size. */
  "qwen-image-3": {
    id: "alibaba/qwen-image-3/text-to-image",
    displayName: { tr: "Qwen Image 3 — Tipografi", en: "Qwen Image 3 — Typography" },
    tier: "standard",
    creditCost: 5,
    estimatedTime: "~12s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {
      num_images: 1,
      image_size: "square_hd",
    },
  },

  /* ── Text-to-Image — GPT-Image 2.5 Flare (2026-09 doğrulandı) ──
     Metin/yazı + prompt uyumu SOTA. Token faturalı → quality/image_size
     pinli (medium/square_hd, tek kare) yoksa düz fiyat patlar. ~$0.08 → 8kr. */
  "gpt-image-25-flare": {
    id: "openai/gpt-image-2.5/flare/text-to-image",
    displayName: { tr: "GPT-Image 2.5 — En İyi Yazı", en: "GPT-Image 2.5 — Best Text" },
    tier: "premium",
    creditCost: 8,
    estimatedTime: "~15s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {
      num_images: 1,
      quality: "medium",
      image_size: "square_hd",
    },
  },

  /* ── Text-to-Image — GPT-Image 2.5 Sunburst LAB (2026-09 doğrulandı) ──
     Flare'in hassasiyet varyantı (yavaş, ince detay). Token faturalı →
     quality/image_size pinli. ~$0.12 → 12kr. */
  "gpt-image-25-sunburst": {
    id: "openai/gpt-image-2.5/sunburst/text-to-image",
    displayName: { tr: "GPT-Image 2.5 Sunburst (LAB)", en: "GPT-Image 2.5 Sunburst (LAB)" },
    tier: "premium",
    creditCost: 12,
    estimatedTime: "~30s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    adminOnly: true,
    defaultParams: {
      num_images: 1,
      quality: "medium",
      image_size: "square_hd",
    },
  },

  /* ── Text-to-Image — Seedream 5 Pro LAB (2026-09 doğrulandı) ──
     Lite'ın amiral gemisi ($0.0675+) → 8kr. Katman ayrıştırmalı poster. */
  "seedream-v5-pro": {
    id: "bytedance/seedream/v5/pro/text-to-image",
    displayName: { tr: "Seedream 5 Pro (LAB)", en: "Seedream 5 Pro (LAB)" },
    tier: "premium",
    creditCost: 8,
    estimatedTime: "~15s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    adminOnly: true,
    defaultParams: {
      num_images: 1,
    },
  },

  /* ── Görsel Düzenleme — Nano Banana 2 Edit ── */
  "nano-banana-2-edit": {
    id: "fal-ai/nano-banana-2/edit",
    displayName: { tr: "Nano Banana 2 — Düzenle", en: "Nano Banana 2 — Edit" },
    tier: "standard",
    creditCost: 10,
    estimatedTime: "~8s",
    imageParamKey: "image_urls",
    multiImage: true,
    promptParamKey: "prompt",
    defaultParams: {
      num_images: 1,
      output_format: "png",
    },
  },

  /* ── Text-to-Image — Ideogram V3 ──
     Etiket / ambalaj / promosyon metni doğruluğunda sınıfının en iyisi. */
  "ideogram-v3": {
    id: "fal-ai/ideogram/v3",
    displayName: { tr: "Ideogram V3 — Metin Ustası", en: "Ideogram V3 — Text Master" },
    tier: "standard",
    creditCost: 6,
    estimatedTime: "~8s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {},
  },

  /* ── Sahne / Arka Plan Değiştir — Ideogram V3 Replace Background ──
     Ürünü koruyup arka planı doğal-dil komutuyla değiştirir. */
  "ideogram-v3-replace-bg": {
    id: "fal-ai/ideogram/v3/replace-background",
    displayName: { tr: "Ideogram — Arka Plan Değiştir", en: "Ideogram — Replace Background" },
    tier: "standard",
    creditCost: 6,
    estimatedTime: "~8s",
    imageParamKey: "image_url",
    promptParamKey: "prompt",
    defaultParams: {},
  },

  /* ── Text-to-Image — Seedream 4.5 (ByteDance) ── */
  "seedream-v45": {
    id: "fal-ai/bytedance/seedream/v4.5/text-to-image",
    displayName: { tr: "Seedream 4.5 — Üretici", en: "Seedream 4.5 — Generator" },
    tier: "standard",
    creditCost: 5,
    estimatedTime: "~10s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {},
  },

  /* ── Görsel Düzenleme — Seedream 4.5 Edit (10 referans görsele kadar) ── */
  "seedream-v45-edit": {
    id: "fal-ai/bytedance/seedream/v4.5/edit",
    displayName: { tr: "Seedream 4.5 — Çok-Ref Düzenle", en: "Seedream 4.5 — Multi-Ref Edit" },
    tier: "standard",
    creditCost: 6,
    estimatedTime: "~60s",
    imageParamKey: "image_urls",
    multiImage: true,
    promptParamKey: "prompt",
    defaultParams: {},
  },

  /* ── Video — Veo 3.1 (Google, Görsel→Video, 4K + senkron ses) ──
     Premium kalite. Ses ekstra ücretli olduğu için varsayılan kapalı. */
  "veo31-i2v": {
    id: "fal-ai/veo3.1/image-to-video",
    displayName: { tr: "Veo 3.1 — Premium Video", en: "Veo 3.1 — Premium Video" },
    tier: "premium",
    // fal: $0.20/sn sessiz, $0.40/sn sesli (720p=1080p fiyatı aynı). Şema
    // default'u 8sn+SESLİ = $3.20/video — 45kr bunun ~3'te-1'iydi (büyük zarar).
    // 4sn + sessiz pinlendi ($0.80), 1080p korundu (720p ile aynı fiyat).
    creditCost: 60,
    estimatedTime: "~3min",
    imageParamKey: "image_url",
    promptParamKey: "prompt",
    defaultParams: {
      resolution: "1080p",
      duration: "4s",
      generate_audio: false,
    },
  },

  /* ── 3D Model — Tripo P1 (native 3D diffusion, oyun-motoru-hazır topoloji) ── */
  "tripo-p1": {
    id: "tripo3d/p1/image-to-3d",
    displayName: { tr: "Tripo P1 — Temiz Topoloji", en: "Tripo P1 — Clean Topology" },
    tier: "standard",
    creditCost: 35, // fal: $0.50 dokulu üretim
    estimatedTime: "~30s",
    imageParamKey: "image_url",
    defaultParams: {},
  },

  /* ── Konuşan Avatar — Kling AI Avatar v2 Standard (2026-09 doğrulandı) ──
     OmniHuman ile aynı iş (görsel + ses → konuşan kafa) ~3x ucuz.
     fal $0.0562/sn → ~10sn $0.56 ≈ 35kr. Girdi: image_url + audio_url. */
  "kling-avatar-v2-std": {
    id: "fal-ai/kling-video/ai-avatar/v2/standard",
    displayName: { tr: "Kling Avatar v2 — Ekonomik", en: "Kling Avatar v2 — Value" },
    tier: "standard",
    creditCost: 35,
    estimatedTime: "~2min",
    imageParamKey: "image_url",
    promptParamKey: "_unused",
    defaultParams: {},
  },

  /* ── Konuşan Avatar — Sync v3 Lip-Sync (2026-09 doğrulandı) ──
     fal $0.133/sn → ~10sn $1.33 (~₺64) → 85kr. Girdi image_url + audio_url,
     süre sesi takip eder. Çıktı {video}. */
  "sync-lipsync-v3": {
    id: "fal-ai/sync-lipsync/v3/image-to-video",
    displayName: { tr: "Sync v3 — Dudak Senkronu", en: "Sync v3 — Lip-Sync" },
    tier: "standard",
    creditCost: 85,
    estimatedTime: "~2min",
    imageParamKey: "image_url",
    promptParamKey: "_unused",
    defaultParams: {},
  },

  /* ── Konuşan Avatar — HeyGen Lip-Sync LAB (2026-09 doğrulandı) ──
     MEVCUT video + ses dublajı (görselden üretmez!). Girdi video_url +
     audio_url → imageParamKey "video_url". $0.10/sn → ~10sn 65kr.
     Çıktı {video}. */
  "heygen-lipsync": {
    id: "fal-ai/heygen/v3/lipsync/precision",
    displayName: { tr: "HeyGen Lip-Sync (LAB)", en: "HeyGen Lip-Sync (LAB)" },
    tier: "standard",
    creditCost: 65,
    estimatedTime: "~2min",
    imageParamKey: "video_url",
    adminOnly: true,
    defaultParams: {},
  },

  /* ── Konuşan Avatar — Kling AI Avatar v2 Pro ──
     OmniHuman'dan ucuz, daha doğal hareket, 60sn'ye kadar ses.
     Ses, OmniHuman ile aynı şekilde job-submit'te audio_url olarak geçilir. */
  "kling-avatar-v2-pro": {
    id: "fal-ai/kling-video/ai-avatar/v2/pro",
    displayName: { tr: "Kling Avatar v2 Pro", en: "Kling Avatar v2 Pro" },
    tier: "standard",
    creditCost: 75, // fal: $0.115/sn — ~10sn varsayımı ($1.15)
    estimatedTime: "~2min",
    imageParamKey: "image_url",
    promptParamKey: "_unused",
    defaultParams: {},
  },

  /* ════════════════════════════════════════════════════════════
     2026-07 fal.ai katalog güncellemesi.
     Tüm endpoint'ler fal.ai/models/<id> katalog sayfasından (200/404) ve
     input şemaları fal OpenAPI'sinden doğrulandı. creditCost fal USD
     fiyatından tahmini — kâr marjına göre gözden geçirilmeli.
     ════════════════════════════════════════════════════════════ */

  /* ── Video — Kling O3 Pro (v3 Pro'nun halefi) ──
     DİKKAT: O3 girdi anahtarı image_url (v3'teki start_image_url DEĞİL).
     $0.112/5s (v3 Pro'dan ucuz) → kredi 25→20 düştü. */
  "kling-o3-i2v": {
    id: "fal-ai/kling-video/o3/pro/image-to-video",
    displayName: { tr: "Kling O3 Pro — Görsel→Video", en: "Kling O3 Pro — Image→Video" },
    tier: "standard",
    // fal: $0.112/sn sessiz ($0.14/sn sesli). Ses kapalı: 5sn = $0.56.
    creditCost: 40,
    estimatedTime: "~2min",
    imageParamKey: "image_url",
    promptParamKey: "prompt",
    defaultParams: {
      duration: "5",
      generate_audio: false,
    },
  },
  "kling-o3-t2v": {
    id: "fal-ai/kling-video/o3/pro/text-to-video",
    displayName: { tr: "Kling O3 Pro — Metin→Video", en: "Kling O3 Pro — Text→Video" },
    tier: "standard",
    creditCost: 40,
    estimatedTime: "~2min",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {
      duration: "5",
      aspect_ratio: "16:9",
      generate_audio: false,
    },
  },

  /* ── Video — Seedance 2.0 (ByteDance, premium) ──
     Saniye başı fiyatlandırma ($0.3034/sn @720p → 5sn $1.52) — duration
     MUTLAKA pinli kalmalı, yoksa 'auto' uzun video üretip maliyeti patlatır.
     Fiyat nedeniyle TOOL_MODELS listesinde DEĞİL (110kr kimse ödemez);
     API v1 modelKey ile hâlâ erişilebilir, o yüzden kredi dürüst tutuldu. */
  "seedance-2-i2v": {
    id: "bytedance/seedance-2.0/image-to-video",
    displayName: { tr: "Seedance 2.0 — Premium Video", en: "Seedance 2.0 — Premium Video" },
    tier: "premium",
    creditCost: 110,
    estimatedTime: "~2min",
    imageParamKey: "image_url",
    promptParamKey: "prompt",
    defaultParams: {
      prompt: "A smooth product showcase with gentle camera movement, professional lighting",
      duration: "5",
      resolution: "720p",
    },
  },

  /* ── Text-to-Image — Ideogram V4 (v3'ün halefi) ──
     Etiket/ambalaj metni doğruluğu lideri; v3'ten hem iyi hem ucuz
     ($0.015 vs v3 ~$0.03+). */
  "ideogram-v4": {
    id: "ideogram/v4",
    displayName: { tr: "Ideogram V4 — Metin Ustası", en: "Ideogram V4 — Text Master" },
    tier: "standard",
    creditCost: 5,
    estimatedTime: "~8s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {},
  },

  /* ── Text-to-Image / Edit — Seedream 5.0 Lite (4.5'in halefi) ──
     4.5 ile aynı fiyat sınıfı ($0.035), yeni nesil kalite. */
  "seedream-v5-lite": {
    id: "fal-ai/bytedance/seedream/v5/lite/text-to-image",
    displayName: { tr: "Seedream 5.0 — Üretici", en: "Seedream 5.0 — Generator" },
    tier: "standard",
    creditCost: 5,
    estimatedTime: "~10s",
    imageParamKey: "_unused",
    promptParamKey: "prompt",
    defaultParams: {},
  },
  "seedream-v5-lite-edit": {
    id: "fal-ai/bytedance/seedream/v5/lite/edit",
    displayName: { tr: "Seedream 5.0 — Çok-Ref Düzenle", en: "Seedream 5.0 — Multi-Ref Edit" },
    tier: "standard",
    creditCost: 6,
    estimatedTime: "~30s",
    imageParamKey: "image_urls",
    multiImage: true,
    promptParamKey: "prompt",
    defaultParams: {},
  },

  /* ── Görsel Düzenleme — FLUX.2 Pro Edit ──
     flux-2-pro'nun resmi edit endpoint'i; MP-bazlı fiyat
     ($0.03 ilk MP). Şema image_urls (dizi) ister. */
  "flux-2-pro-edit": {
    id: "fal-ai/flux-2-pro/edit",
    displayName: { tr: "FLUX.2 Pro — Düzenle", en: "FLUX.2 Pro — Edit" },
    tier: "standard",
    creditCost: 6,
    estimatedTime: "~10s",
    imageParamKey: "image_urls",
    multiImage: true,
    promptParamKey: "prompt",
    defaultParams: {
      output_format: "png",
    },
  },
};

/**
 * Admin-lab gate: adminOnly models (unpriced trials) are blocked for
 * non-admin callers in every public submit path. The admin Model Lab
 * uses its own probe endpoint instead.
 */
export function isModelBlockedForUser(
  model: ModelConfig | undefined,
  isAdminUser: boolean
): boolean {
  return !!model?.adminOnly && !isAdminUser;
}

export const TOOL_MODELS: Record<ToolType, string[]> = {
  "3d-model": ["triposr", "trellis-v1", "trellis-2", "meshy-6-image", "meshy-v7", "meshy-6-text", "tripo-v25-mv", "tripo-h31", "tripo-p1", "hunyuan3d-v3", "hunyuan3d-v31-pro", "hyper3d-rodin"],
  "bg-remove": ["bria-rmbg", "birefnet"],
  "enhance": ["recraft-crisp-upscale", "aura-sr"],
  "scene": ["bria-product-shot", "ideogram-v3-replace-bg", "nano-banana-pro-edit"],
  // 2026-07: Kling v3 Pro girişleri O3 Pro haleflerine yerini bıraktı
  // (MODELS'te duruyorlar — eski job kayıtları anahtar çözebilsin diye).
  // Seedance 2.0 fiyat nedeniyle listede değil (110kr) — MODELS'te duruyor.
  "video": ["wan-i2v", "wan-3", "minimax-h3-max", "seedance-25", "happy-horse-v11", "kling-o3-t2v", "kling-o3-i2v", "veo31-i2v"],
  "aplus": ["bria-product-shot-hd"],
  "image-edit": ["flux-kontext", "flux-kontext-max", "flux-2-pro-edit", "nano-banana-pro-edit", "nano-banana-2-edit", "seedream-v5-lite-edit"],
  "inpainting": ["flux-fill"],
  "object-removal": ["object-removal"],
  "text-to-image": ["flux-pro", "flux-dev", "flux-schnell", "nano-banana-pro", "nano-banana-2", "ideogram-v4", "seedream-v5-lite", "seedream-v5-pro", "qwen-image-3", "gpt-image-25-flare", "gpt-image-25-sunburst"],
  "qr-code": ["qr-code-ai"],
  "talking-avatar": ["omnihuman", "kling-avatar-v2-std", "kling-avatar-v2-pro", "sync-lipsync-v3", "heygen-lipsync"],
  "logo": ["recraft-v4", "recraft-v4-svg"],
  "social-kit": [], // Orchestration tool — uses scene + video internally
  "virtual-tryon": ["fashn-tryon"],
  "srt-voiceover": ["minimax-speech-28-hd", "minimax-speech-02-hd", "minimax-28-turbo", "eleven-v3"],
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
  "srt-voiceover": "srtVoiceover",
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
  "social-kit": 67,   // 4 scenes (32) + 1 video (wan-i2v 35)
};

/** Konuşan-avatar script üst sınırı (karakter). TTS sesi ~15 karakter/sn
 *  konuşur; OmniHuman/Kling-Avatar SANIYE BAŞI ücretlendirir ($0.16/sn ve
 *  $0.115/sn) — sınırsız script sınırsız maliyet demek. 150 karakter ≈ 10sn,
 *  sabit kredi fiyatlaması bu varsayıma göre. */
export const MAX_AVATAR_SCRIPT_CHARS = 150;

/** Tools that accept a text prompt from the user */
export const TOOLS_WITH_PROMPT: ToolType[] = ["scene", "video", "image-edit", "inpainting", "object-removal", "text-to-image", "qr-code", "logo"];

/** Tools that DON'T need an image input (text-only).
 *  NOTE: qr-code is NOT here — it generates a QR control image server-side
 *  (submitJob) and then runs illusion-diffusion, so the router must send image_url. */
export const TOOLS_TEXT_ONLY: ToolType[] = ["text-to-image", "logo", "srt-voiceover"];

/** Tools that accept multiple images (multi-view or dual-input) */
export const TOOLS_MULTI_IMAGE: ToolType[] = ["3d-model", "virtual-tryon"];

/** Max images for multi-image tools */
export const MAX_MULTI_IMAGES = 4;
