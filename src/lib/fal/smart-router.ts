import { MODELS, type ModelConfig, type ToolType, type ModelTier } from "./models";

interface RouteRequest {
  tool: ToolType;
  tier?: ModelTier;
  imageUrl?: string;
  /** Multiple image URLs for multi-view models (e.g. 3D) */
  imageUrls?: string[];
  /** Optional user-provided text prompt (scene description, video prompt, etc.) */
  prompt?: string;
  locale?: string;
}

interface RouteResult {
  model: ModelConfig;
  modelKey: string;
  input: Record<string, unknown>;
}

export function routeRequest(request: RouteRequest): RouteResult {
  const { tool, tier = "standard", imageUrl, imageUrls, prompt } = request;

  const imageCount = imageUrls?.length ?? (imageUrl ? 1 : 0);
  const modelKey = selectModel(tool, tier, imageCount);
  const model = MODELS[modelKey];

  const input: Record<string, unknown> = {
    ...model.defaultParams,
  };

  // Build the image input based on model type
  if (model.namedImageParams && imageUrls) {
    // Named multi-image params: map array positions to specific param names
    // e.g. Hunyuan3D multi-view: [0]→front_image_url, [1]→back_image_url, [2]→left_image_url
    for (let i = 0; i < model.namedImageParams.length; i++) {
      input[model.namedImageParams[i]] = imageUrls[i] ?? "";
    }
  } else if (model.multiImage) {
    // Array-based multi-image (TRELLIS): always use first image only (single-photo mode)
    const firstUrl = imageUrl ?? imageUrls?.[0] ?? "";
    input[model.imageParamKey] = [firstUrl];
  } else {
    // Single-image model
    input[model.imageParamKey] = imageUrl ?? imageUrls?.[0] ?? "";
  }

  // Override the prompt param if user provided one and model supports it
  if (prompt && model.promptParamKey) {
    input[model.promptParamKey] = prompt;
  }

  return { model, modelKey, input };
}

function selectModel(tool: ToolType, tier: ModelTier, imageCount: number): string {
  switch (tool) {
    case "3d-model":
      // 3+ photos → Hunyuan3D multi-view (front/back/left)
      if (imageCount >= 3) return "hunyuan3d-v2-mv";
      // Single photo: tier-based TRELLIS
      if (tier === "fast") return "trellis-v1";
      return "trellis-2";

    case "bg-remove":
      return "birefnet";

    case "enhance":
      return "aura-sr";

    case "scene":
      return "bria-product-shot";

    case "video":
      return "wan-i2v";

    case "aplus":
      return "bria-product-shot-hd";

    default:
      throw new Error(`Tool "${tool}" is not yet available`);
  }
}
