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

  const modelKey = selectModel(tool, tier);
  const model = MODELS[modelKey];

  // Build the image input based on model type
  let imageValue: string | string[];
  if (model.multiImage) {
    // Multi-image model: use imageUrls array, fallback to wrapping single imageUrl
    imageValue = imageUrls ?? (imageUrl ? [imageUrl] : []);
  } else {
    // Single-image model
    imageValue = imageUrl ?? "";
  }

  const input: Record<string, unknown> = {
    [model.imageParamKey]: imageValue,
    ...model.defaultParams,
  };

  // Override the prompt param if user provided one and model supports it
  if (prompt && model.promptParamKey) {
    input[model.promptParamKey] = prompt;
  }

  return { model, modelKey, input };
}

function selectModel(tool: ToolType, tier: ModelTier): string {
  switch (tool) {
    case "3d-model":
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
