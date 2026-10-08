import { z } from "zod";
import { MODELS, TOOL_MODELS, MAX_AVATAR_SCRIPT_CHARS, MAX_MULTI_IMAGES, type ToolType } from "@/lib/fal/models";
import { assertModelForTool } from "@/lib/fal/model-selection";
import { routeRequest } from "@/lib/fal/smart-router";
import { imageUrlSchema } from "@/lib/validations/job-submit";
import { isAllowedVoice } from "@/lib/voiceover/voices";

export class RegenerationInputError extends Error {
  constructor(message = "Original generation settings are unavailable; submit a new request.") {
    super(message);
    this.name = "RegenerationInputError";
  }
}

interface StoredJob {
  tool: string;
  model_id: string;
  project_id?: string | null;
  original_request: unknown;
  input_params: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

// Only user-facing generation fields can be replayed. Credit reservations,
// provider stages, orchestration IDs and caller identities are never copied.
const replaySchema = z.object({
  tool: z.custom<ToolType>((value) => typeof value === "string" && Object.hasOwn(TOOL_MODELS, value)),
  modelKey: z.string().min(1),
  tier: z.enum(["fast", "standard", "premium"]).optional(),
  projectId: z.string().uuid().optional(),
  imageUrl: imageUrlSchema.optional(),
  imageUrls: z.array(imageUrlSchema).min(1).max(MAX_MULTI_IMAGES).optional(),
  prompt: z.string().min(1).max(5000).optional(),
  script: z.string().min(1).max(MAX_AVATAR_SCRIPT_CHARS).optional(),
  voiceId: z.string().refine(isAllowedVoice).optional(),
  audioUrl: imageUrlSchema.optional(),
  autoEnhance: z.boolean().optional(),
  skipBgRemove: z.boolean().optional(),
  extraParams: z.record(z.string(), z.unknown()).optional(),
  promptContext: z.object({
    kind: z.enum(["scene", "aplus", "image-edit"]),
    sceneType: z.string().optional(),
    template: z.string().optional(),
    platform: z.string().optional(),
    action: z.string().optional(),
    caption: z.string().optional(),
  }).optional(),
});

export function buildRegenerationInput(job: StoredJob) {
  if (job.tool === "srt-voiceover" || job.tool === "social-kit") {
    throw new RegenerationInputError("Use this tool's dedicated generation flow.");
  }
  const stored = asRecord(job.original_request);
  if (job.original_request != null && !stored) throw new RegenerationInputError();

  let modelKey: string;
  if (stored?.modelKey !== undefined) {
    if (typeof stored.modelKey !== "string") throw new RegenerationInputError();
    modelKey = stored.modelKey;
  } else {
    // Do not guess a tier or use today's default for legacy jobs. An endpoint
    // must resolve to exactly one currently allowed key for the original tool.
    const matches = Object.entries(MODELS).filter(([key, model]) =>
      (model.id === job.model_id || key === job.model_id) &&
      Object.hasOwn(TOOL_MODELS, job.tool) &&
      TOOL_MODELS[job.tool as ToolType].includes(key)
    );
    if (matches.length !== 1) throw new RegenerationInputError("Original model is unavailable or ambiguous; select a model in a new request.");
    modelKey = matches[0][0];
  }

  try {
    assertModelForTool(job.tool, modelKey);
    const model = MODELS[modelKey];
    if (model.id !== job.model_id && modelKey !== job.model_id) throw new RegenerationInputError();

    let source: Record<string, unknown>;
    if (stored && Object.keys(stored).length > 0) {
      source = stored;
    } else {
      const params = asRecord(job.input_params) ?? {};
      source = {};
      const image = params[model.imageParamKey];
      if (Array.isArray(image)) source.imageUrls = image;
      else if (typeof image === "string" && image) source.imageUrl = image;
      if (model.namedImageParams) {
        const namedImages = model.namedImageParams.map((key) => params[key]);
        const lastImage = namedImages.findLastIndex((url) => url !== undefined);
        // A missing middle view must not shift the back image into the left slot.
        if (lastImage >= 0) source.imageUrls = namedImages.slice(0, lastImage + 1);
      }
      if (model.promptParamKey && params[model.promptParamKey]) source.prompt = params[model.promptParamKey];
      if (job.tool === "talking-avatar") source.audioUrl = params.audio_url;
      if (job.tool === "logo") {
        const extraParams: Record<string, unknown> = {};
        if (params.style !== undefined) extraParams.style = params.style;
        if (params.colors !== undefined) extraParams.colors = params.colors;
        if (Object.keys(extraParams).length) source.extraParams = extraParams;
      }
    }

    const parsed = replaySchema.safeParse({
      ...source,
      tool: job.tool,
      modelKey,
      projectId: job.project_id ?? undefined,
    });
    if (!parsed.success) throw new RegenerationInputError();
    const replay = parsed.data;
    if (job.tool === "talking-avatar" && !replay.script && !replay.audioUrl) throw new RegenerationInputError();
    routeRequest({ ...replay, prompt: replay.audioUrl ?? replay.prompt });
    return replay;
  } catch (error) {
    if (error instanceof RegenerationInputError) throw error;
    throw new RegenerationInputError();
  }
}
