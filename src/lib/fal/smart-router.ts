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
    // e.g. Tripo: [0]→front, [1]→left, [2]→back, [3]→right
    for (let i = 0; i < model.namedImageParams.length; i++) {
      if (imageUrls[i]) {
        input[model.namedImageParams[i]] = imageUrls[i];
      }
    }
  } else if (model.multiImage) {
    // Array-based multi-image: send all provided URLs as array
    if (imageUrls && imageUrls.length > 0) {
      input[model.imageParamKey] = imageUrls;
    } else {
      input[model.imageParamKey] = [imageUrl ?? ""];
    }
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
      // 4 photos (or video frames) → Hunyuan3D V3 premium multi-view
      if (imageCount >= 4) {
        if (tier === "premium") return "hunyuan3d-v3"; // ~3min, PBR, 500k poly
        if (tier === "fast") return "tripo-v25-mv";    // ~30s, named params
        return "hunyuan3d-v3";                          // default: best quality
      }
      // 2-3 photos → multi-image models (tier-based)
      if (imageCount >= 2) {
        if (tier === "fast") return "tripo-v25-mv";  // ~30s, standard texture
        return "meshy-5-multi";                       // ~3min, PBR texture
      }
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
