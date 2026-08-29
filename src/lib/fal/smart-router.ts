import { MODELS, TOOLS_TEXT_ONLY, type ModelConfig, type ToolType, type ModelTier } from "./models";

interface RouteRequest {
  tool: ToolType;
  tier?: ModelTier;
  /** Explicit model key from MODELS — when set, skips tier-based selection. */
  modelKey?: string;
  imageUrl?: string;
  /** Multiple image URLs for multi-view models (e.g. 3D) */
  imageUrls?: string[];
  /** Optional user-provided text prompt (scene description, video prompt, etc.) */
  prompt?: string;
  locale?: string;
  /** Tool-specific API params (e.g. Recraft style/colors, video duration).
   *  Merged into fal.ai input after base params are built.
   *  Meta keys like `outputFormat` are consumed by selectModel and stripped. */
  extraParams?: Record<string, unknown>;
}

interface RouteResult {
  model: ModelConfig;
  modelKey: string;
  input: Record<string, unknown>;
}

interface SafeLogoExtraParams {
  outputFormat?: "png" | "svg";
  style?: "logo" | "digital_illustration";
  colors?: Array<{ rgb: { r: number; g: number; b: number } }>;
}

function validateExtraParams(
  tool: ToolType,
  extraParams?: Record<string, unknown>
): SafeLogoExtraParams | undefined {
  if (!extraParams) return undefined;
  if (tool !== "logo") {
    throw new Error(`extraParams are not supported for tool "${tool}"`);
  }

  const allowedKeys = new Set(["outputFormat", "style", "colors"]);
  const unknownKey = Object.keys(extraParams).find((key) => !allowedKeys.has(key));
  if (unknownKey) {
    throw new Error(`Unsupported logo parameter: ${unknownKey}`);
  }

  const { outputFormat, style, colors } = extraParams;
  if (outputFormat !== undefined && outputFormat !== "png" && outputFormat !== "svg") {
    throw new Error("Invalid logo outputFormat");
  }
  if (style !== undefined && style !== "logo" && style !== "digital_illustration") {
    throw new Error("Invalid logo style");
  }
  if (colors !== undefined) {
    if (!Array.isArray(colors) || colors.length > 3) {
      throw new Error("Logo colors must contain at most 3 RGB colors");
    }
    for (const color of colors) {
      const rgb = (color as { rgb?: Record<string, unknown> } | null)?.rgb;
      if (!rgb || Object.keys(rgb).some((key) => !["r", "g", "b"].includes(key))) {
        throw new Error("Invalid logo RGB color");
      }
      for (const channel of ["r", "g", "b"] as const) {
        const value = rgb[channel];
        if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 255) {
          throw new Error("Logo RGB channels must be integers from 0 to 255");
        }
      }
    }
  }

  return { outputFormat, style, colors } as SafeLogoExtraParams;
}

export function routeRequest(request: RouteRequest): RouteResult {
  const { tool, tier = "standard", imageUrl, imageUrls, prompt, extraParams } = request;
  const safeExtraParams = validateExtraParams(tool, extraParams);

  const imageCount = imageUrls?.length ?? (imageUrl ? 1 : 0);
  const modelKey = request.modelKey && MODELS[request.modelKey]
    ? request.modelKey
    : selectModel(tool, tier, imageCount, safeExtraParams);
  const model = MODELS[modelKey];

  const input: Record<string, unknown> = {
    ...model.defaultParams,
  };

  // Text-only tools OR hybrid tools in text-only mode (no image provided)
  const isTextOnly = TOOLS_TEXT_ONLY.includes(tool);
  const isTextOnlyMode = !imageUrl && (!imageUrls || imageUrls.length === 0) && prompt;

  // Defensive: image-requiring models must receive an image. The API boundary
  // (job-submit validation) already enforces this, but never silently send an
  // empty URL to fal.ai — fail fast with a clear error instead.
  if (!isTextOnly && !isTextOnlyMode && !imageUrl && (!imageUrls || imageUrls.length === 0)) {
    throw new Error(`Model "${model.id}" requires an image input, but none was provided`);
  }

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

  // Only the validated, fixed-cost logo fields may reach fal.ai. outputFormat
  // is metadata used above to select the correctly-priced raster/vector model.
  if (safeExtraParams?.style) {
    input.style = safeExtraParams.style;
  }
  if (safeExtraParams?.colors) {
    input.colors = safeExtraParams.colors;
  }

  // Clean up _unused placeholder key — fal.ai rejects unknown params
  delete input["_unused"];

  return { model, modelKey, input };
}

function selectModel(tool: ToolType, tier: ModelTier, imageCount: number, extraParams?: SafeLogoExtraParams): string {
  switch (tool) {
    case "3d-model":
      // Text-only → Meshy 6 text-to-3d (with rigging support)
      if (imageCount === 0) return "meshy-6-text";
      // Premium tier
      if (tier === "premium") {
        if (imageCount >= 2) return "hunyuan3d-v31-pro"; // 8 angles, 1.5M poly, 8K PBR
        return "hyper3d-rodin";                           // Rodin premium single-image
      }
      // Fast tier
      if (tier === "fast") {
        if (imageCount >= 2) return "tripo-v25-mv";
        return "triposr";  // instant preview <1s
      }
      // Standard tier
      if (imageCount >= 2) return "hunyuan3d-v3"; // 4-angle multi-view (replaced meshy-5-multi)
      return "meshy-6-image";  // best single-image quality

    case "bg-remove":
      return "bria-rmbg";  // commercial license clean (was birefnet)

    case "enhance":
      return "recraft-crisp-upscale";  // fal benchmark #1 for product detail; replaces aura-sr

    case "scene":
      return "bria-product-shot";

    case "video":
      // Text-only → Kling O3 Pro text-to-video (native audio)
      if (imageCount === 0) return "kling-o3-t2v";
      // Premium tier image → Kling O3 Pro image-to-video (native audio)
      if (tier === "premium") return "kling-o3-i2v";
      // Standard/fast image → Wan image-to-video (cheapest)
      return "wan-i2v";

    case "aplus":
      return "bria-product-shot-hd";

    case "image-edit":
      // Premium tier → Kontext Max (better prompt adherence + typography)
      if (tier === "premium") return "flux-kontext-max";
      return "flux-kontext";

    case "inpainting":
      return "flux-fill";

    case "object-removal":
      return "object-removal";

    case "text-to-image":
      if (tier === "fast") return "flux-schnell";
      if (tier === "standard") return "flux-dev";  // balanced (LoRA)
      return "flux-pro";                            // best quality

    case "qr-code":
      return "qr-code-ai";

    case "talking-avatar":
      return "omnihuman";

    case "logo":
      // SVG variant selected via extraParams.outputFormat from the UI toggle
      if (extraParams?.outputFormat === "svg") return "recraft-v4-svg";
      return "recraft-v4";

    case "virtual-tryon":
      return "fashn-tryon";

    case "social-kit":
      throw new Error("social-kit is an orchestration tool — use the orchestration handler");

    default:
      throw new Error(`Tool "${tool}" is not yet available`);
  }
}
