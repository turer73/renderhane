import { MAX_MULTI_IMAGES, MODELS, TOOL_MODELS, type ModelConfig, type ModelTier, type ToolType } from "@/lib/fal/models";
import { routeRequest } from "@/lib/fal/smart-router";

/**
 * Shared image-input contract. The browser (optimizer, upload UI) and the
 * server (pre-reservation preflight) read limits from this one module, so the
 * same file is accepted or rejected for the same reason on both sides.
 */

export type ImageFormat = "jpeg" | "png" | "webp" | "gif" | "bmp" | "avif" | "heic";

export interface ImageFormatInfo {
  label: string;
  mime: string;
  /** The format can carry transparency. */
  alpha: boolean;
}

export const IMAGE_FORMATS: Record<ImageFormat, ImageFormatInfo> = {
  jpeg: { label: "JPEG", mime: "image/jpeg", alpha: false },
  png: { label: "PNG", mime: "image/png", alpha: true },
  webp: { label: "WebP", mime: "image/webp", alpha: true },
  gif: { label: "GIF", mime: "image/gif", alpha: true },
  bmp: { label: "BMP", mime: "image/bmp", alpha: false },
  avif: { label: "AVIF", mime: "image/avif", alpha: true },
  heic: { label: "HEIC/HEIF", mime: "image/heic", alpha: true },
};

/** Ceiling for every server-side read, whatever a provider documents. */
export const IMAGE_DOWNLOAD_HARD_LIMIT_BYTES = 32 * 1024 * 1024;
/** Decode guard: larger header dimensions are refused before any decode. */
export const IMAGE_MAX_PIXELS = 50_000_000;
/** Applied when a provider documents no byte limit for the model (decimal MB, like the messages). */
export const UNVERIFIED_MAX_BYTES = 20_000_000;
/** Applied when a provider documents no format list for the model. */
export const UNVERIFIED_FORMATS: readonly ImageFormat[] = ["jpeg", "png", "webp"];
/** Sanity floor: smaller images are almost certainly not usable input. */
export const MIN_IMAGE_DIMENSION = 64;

export type ImageAdvisory =
  | { code: "preferred_min_short_side"; pixels: number }
  | { code: "preferred_aspect"; ratios: readonly string[] };

interface DocumentedImageLimits {
  formats?: readonly ImageFormat[];
  maxBytes?: number;
  minDimension?: number;
  maxDimension?: number;
  maxImages?: number;
  advisories?: readonly ImageAdvisory[];
}

export const DOCUMENTED_LIMITS_SOURCE =
  "fal OpenAPI input schema (fal.ai/api/openapi/queue/openapi.json?endpoint_id=…), read 2026-10-02";

/**
 * Constraints copied from each endpoint's public fal OpenAPI input schema.
 * "MB" is read as 10^6 bytes, the stricter interpretation. A model that is
 * absent here documents no image constraint: it gets the safety defaults and
 * every caller reports its limits as unverified.
 */
const DOCUMENTED: Record<string, DocumentedImageLimits> = {
  "bria-product-shot": { formats: ["jpeg", "png", "webp"], maxBytes: 12_000_000 },
  "bria-product-shot-hd": { formats: ["jpeg", "png", "webp"], maxBytes: 12_000_000 },
  "hunyuan3d-v31-pro": {
    formats: ["jpeg", "png", "webp"],
    maxBytes: 8_000_000,
    minDimension: 128,
    maxDimension: 5000,
  },
  "hyper3d-rodin": { maxImages: 5 },
  // Meshy converts AVIF/HEIF itself; WebP is not in its documented list.
  "meshy-6-image": { formats: ["jpeg", "png", "avif", "heic"] },
  "meshy-v7": { formats: ["jpeg", "png", "avif", "heic"] },
  "meshy-v71": { formats: ["jpeg", "png", "avif", "heic"] },
  "recraft-crisp-upscale": { formats: ["png"] },
  "seedance-2-i2v": { formats: ["jpeg", "png", "webp"], maxBytes: 30_000_000 },
  "seedream-v45-edit": { maxImages: 10 },
  "seedream-v5-lite-edit": { maxImages: 10 },
  "sync-lipsync-v3": { formats: ["jpeg", "png", "webp"] },
  // Documented as guidance (the provider crops instead of rejecting).
  "veo31-i2v": {
    advisories: [
      { code: "preferred_min_short_side", pixels: 720 },
      { code: "preferred_aspect", ratios: ["16:9", "9:16"] },
    ],
  },
  "wan-i2v": { formats: ["jpeg", "png", "webp", "bmp"], maxBytes: 20_000_000 },
};

export type ImageInputKind = "image" | "video" | "none";

export interface ImageInputVerification {
  formats: boolean;
  size: boolean;
  dimensions: boolean;
  source: string | null;
}

export interface ImageInputLimits {
  modelKeys: string[];
  inputKind: ImageInputKind;
  maxBytes: number;
  maxPixels: number;
  minDimension: number;
  maxDimension: number | null;
  formats: ImageFormat[];
  minImages: number;
  maxImages: number;
  advisories: ImageAdvisory[];
  verification: ImageInputVerification;
}

/** What the model's primary input actually is; a video URL is not an image. */
export function imageInputKind(model: ModelConfig): ImageInputKind {
  if (model.imageParamKey === "_unused") return "none";
  return /video/i.test(model.imageParamKey) ? "video" : "image";
}

function imageCount(model: ModelConfig, documentedMax: number | undefined) {
  if (imageInputKind(model) !== "image") return { min: 0, max: 0 };
  // Every public entry point caps a request at MAX_MULTI_IMAGES images.
  const structural = model.namedImageParams
    ? Math.min(model.namedImageParams.length, MAX_MULTI_IMAGES)
    : model.multiImage
      ? MAX_MULTI_IMAGES
      : 1;
  return { min: 1, max: Math.min(structural, documentedMax ?? structural) };
}

export function getImageInputLimits(modelKey: string): ImageInputLimits {
  if (!Object.hasOwn(MODELS, modelKey)) throw new Error(`Unknown model: ${modelKey}`);
  const model = MODELS[modelKey];
  const documented = Object.hasOwn(DOCUMENTED, modelKey) ? DOCUMENTED[modelKey] : {};
  const count = imageCount(model, documented.maxImages);
  const documentedAny = Object.keys(documented).length > 0;
  return {
    modelKeys: [modelKey],
    inputKind: imageInputKind(model),
    maxBytes: Math.min(documented.maxBytes ?? UNVERIFIED_MAX_BYTES, IMAGE_DOWNLOAD_HARD_LIMIT_BYTES),
    maxPixels: IMAGE_MAX_PIXELS,
    minDimension: Math.max(documented.minDimension ?? 0, MIN_IMAGE_DIMENSION),
    maxDimension: documented.maxDimension ?? null,
    formats: [...(documented.formats ?? UNVERIFIED_FORMATS)],
    minImages: count.min,
    maxImages: count.max,
    advisories: [...(documented.advisories ?? [])],
    verification: {
      formats: documented.formats !== undefined,
      size: documented.maxBytes !== undefined,
      dimensions: documented.minDimension !== undefined || documented.maxDimension !== undefined,
      source: documentedAny ? DOCUMENTED_LIMITS_SOURCE : null,
    },
  };
}

/**
 * The strictest limits that satisfy every given set. Used when the exact
 * model is not known yet (tier routing) or one image feeds several models.
 */
export function intersectImageInputLimits(sets: readonly ImageInputLimits[]): ImageInputLimits {
  const images = sets.filter((set) => set.inputKind === "image");
  if (images.length === 0) {
    if (sets.length === 0) throw new Error("No limits to intersect");
    return sets[0];
  }
  const [first, ...rest] = images;
  const maxDimensions = images.map((set) => set.maxDimension).filter((value): value is number => value !== null);
  const advisories = new Map<string, ImageAdvisory>();
  for (const set of images) for (const advisory of set.advisories) advisories.set(JSON.stringify(advisory), advisory);
  return {
    modelKeys: [...new Set(images.flatMap((set) => set.modelKeys))],
    inputKind: "image",
    maxBytes: Math.min(...images.map((set) => set.maxBytes)),
    maxPixels: Math.min(...images.map((set) => set.maxPixels)),
    minDimension: Math.max(...images.map((set) => set.minDimension)),
    maxDimension: maxDimensions.length ? Math.min(...maxDimensions) : null,
    formats: first.formats.filter((format) => rest.every((set) => set.formats.includes(format))),
    minImages: Math.max(...images.map((set) => set.minImages)),
    maxImages: Math.min(...images.map((set) => set.maxImages)),
    advisories: [...advisories.values()],
    verification: {
      formats: images.every((set) => set.verification.formats),
      size: images.every((set) => set.verification.size),
      dimensions: images.every((set) => set.verification.dimensions),
      source: images.some((set) => set.verification.source) ? DOCUMENTED_LIMITS_SOURCE : null,
    },
  };
}

const PLACEHOLDER_IMAGE_URL = "https://placeholder.invalid/image.png";

/**
 * Limits for a tool selection before the request is sent. The server routes
 * by tier and image count; mirror that here so the browser optimizes for the
 * model that will actually run. If routing cannot be mirrored, fall back to
 * the strictest limits of every image model the tool can use.
 */
export function getSelectionImageInputLimits(selection: {
  tool: ToolType;
  tier?: ModelTier;
  modelKey?: string;
  imageCount?: number;
}): ImageInputLimits {
  if (selection.modelKey) return getImageInputLimits(selection.modelKey);
  const count = Math.max(1, selection.imageCount ?? 1);
  try {
    const { modelKey } = routeRequest({
      tool: selection.tool,
      tier: selection.tier,
      imageUrl: count === 1 ? PLACEHOLDER_IMAGE_URL : undefined,
      imageUrls: count > 1 ? Array.from({ length: count }, () => PLACEHOLDER_IMAGE_URL) : undefined,
      prompt: "placeholder",
    });
    return getImageInputLimits(modelKey);
  } catch {
    const candidates = (TOOL_MODELS[selection.tool] ?? [])
      .filter((key) => imageInputKind(MODELS[key]) === "image")
      .map(getImageInputLimits);
    if (candidates.length === 0) throw new Error(`Tool has no image models: ${selection.tool}`);
    return intersectImageInputLimits(candidates);
  }
}

export function isLimitsFullyVerified(limits: ImageInputLimits): boolean {
  return limits.verification.formats && limits.verification.size;
}
