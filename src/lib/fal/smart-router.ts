import { MODELS, type ModelConfig, type ToolType, type ModelTier } from "./models";

interface RouteRequest {
  tool: ToolType;
  tier?: ModelTier;
  imageUrl: string;
  locale?: string;
}

interface RouteResult {
  model: ModelConfig;
  modelKey: string;
  input: Record<string, unknown>;
}

export function routeRequest(request: RouteRequest): RouteResult {
  const { tool, tier = "standard", imageUrl } = request;

  const modelKey = selectModel(tool, tier);
  const model = MODELS[modelKey];

  const input: Record<string, unknown> = {
    [model.imageParamKey]: imageUrl,
    ...model.defaultParams,
  };

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

    default:
      throw new Error(`Tool "${tool}" is not yet available`);
  }
}
