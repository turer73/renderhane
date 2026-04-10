import { MODELS, TOOLS_TEXT_ONLY, type ModelConfig, type ToolType, type ModelTier } from "./models";

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

  // Text-only tools OR hybrid tools in text-only mode (no image provided)
  const isTextOnly = TOOLS_TEXT_ONLY.includes(tool);
  const isTextOnlyMode = !imageUrl && (!imageUrls || imageUrls.length === 0) && prompt;

  // Build the image input based on model type
  if (isTextOnly || isTextOnlyMode) {
    // No image input needed — prompt is the only input
  } else if (model.namedImageParams && imageUrls) {
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

  // Special handling: talking-avatar passes audio URL via prompt field
  if (tool === "talking-avatar" && prompt) {
    input["audio_url"] = prompt;
  }

  // Clean up _unused placeholder key — fal.ai rejects unknown params
  delete input["_unused"];

  return { model, modelKey, input };
}

function selectModel(tool: ToolType, tier: ModelTier, imageCount: number): string {
  switch (tool) {
    case "3d-model":
      // Text-only → Meshy 6 text-to-3d (with rigging support)
      if (imageCount === 0) return "meshy-6-text";
      // Premium tier → Hunyuan3D V3.1 Pro (8 angles, 1.5M poly, 8K PBR)
      if (tier === "premium") return "hunyuan3d-v31-pro";
      // Fast tier
      if (tier === "fast") {
        if (imageCount >= 2) return "tripo-v25-mv";
        return "triposr";  // instant preview <1s
      }
      // Standard tier
      if (imageCount >= 2) return "meshy-5-multi";
      return "meshy-6-image";  // best single-image quality

    case "bg-remove":
      return "bria-rmbg";  // commercial license clean (was birefnet)

    case "enhance":
      return "aura-sr";

    case "scene":
      return "bria-product-shot";

    case "video":
      // Text-only → Kling 2.6 text-to-video
      if (imageCount === 0) return "kling-t2v";
      // Image → Wan 2.6 image-to-video
      return "wan-i2v";

    case "aplus":
      return "bria-product-shot-hd";

    case "image-edit":
      return "flux-kontext";

    case "text-to-image":
      if (tier === "fast") return "flux-schnell";
      if (tier === "standard") return "flux-dev";  // balanced (LoRA)
      return "flux-pro";                            // best quality

    case "qr-code":
      return "qr-code-ai";

    case "talking-avatar":
      return "omnihuman";

    case "logo":
      return "recraft-v3";

    case "virtual-tryon":
      return "fashn-tryon";

    case "social-kit":
      throw new Error("social-kit is an orchestration tool — use the orchestration handler");

    default:
      throw new Error(`Tool "${tool}" is not yet available`);
  }
}
