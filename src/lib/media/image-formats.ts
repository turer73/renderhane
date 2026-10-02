/**
 * Image formats and global bounds, without any model configuration, so
 * browser code that only prepares images (e.g. the free tools) does not pull
 * in the model catalog. image-input-contract re-exports everything here.
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

export type ImageInputKind = "image" | "video" | "none";

export type ImageAdvisory =
  | { code: "preferred_min_short_side"; pixels: number }
  | { code: "preferred_aspect"; ratios: readonly string[] };

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
