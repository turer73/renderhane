import { IMAGE_FORMATS, type ImageFormat, type ImageInputLimits } from "./image-formats";
import {
  adviseImageFacts,
  checkImageFacts,
  formatBytesTr,
  undecodableImageIssue,
  unreadableImageIssue,
  type ImageFacts,
  type ImageInputIssue,
  type ImagePosition,
} from "./image-limit-check";
import { probeImage } from "./image-probe";

/**
 * Browser-side preparation of a user image for a model. An image that
 * already fits is decoded once (a header alone is not an image) and returned
 * untouched. Otherwise it is re-encoded in a format
 * the model accepts, trading quality and size in small steps; transparency is
 * never dropped silently and the original file is always kept, so a retry or
 * a model change starts again from the original.
 */

export interface DecodedImage {
  /** Displayed size, after EXIF orientation. */
  width: number;
  height: number;
  /** At least one pixel is not fully opaque. */
  hasAlpha: boolean;
  close(): void;
}

export interface ImageCodec {
  /** Rejects when the file does not decode; cheaper than `decode` when available. */
  verify?(file: Blob): Promise<void>;
  decode(file: Blob, knownOpaque: boolean): Promise<DecodedImage>;
  /** Must reject when the browser cannot produce exactly the requested format. */
  encode(image: DecodedImage, target: EncodeTarget): Promise<Blob>;
}

export interface EncodeTarget {
  width: number;
  height: number;
  format: ImageFormat;
  /** 0-1 for lossy formats; ignored for PNG. */
  quality: number;
}

export interface ImageTransform {
  fromFormat: ImageFormat;
  toFormat: ImageFormat;
  fromWidth: number;
  fromHeight: number;
  toWidth: number;
  toHeight: number;
  scale: number;
  quality: number | null;
  transparencyFlattened: boolean;
  bytesBefore: number;
  bytesAfter: number;
}

export type ConfirmationReason = "quality" | "transparency";

export interface PreparedImage {
  /** What should be uploaded. */
  file: File;
  /** The user's file, untouched. */
  original: File;
  facts: ImageFacts;
  transform: ImageTransform | null;
  /** Visible quality or transparency loss: show a preview and let the user choose. */
  confirmationReasons: ConfirmationReason[];
  advisories: string[];
}

export class ImagePreparationError extends Error {
  constructor(readonly issues: ImageInputIssue[]) {
    super(issues[0]?.message ?? "Image cannot be prepared");
    this.name = "ImagePreparationError";
  }
}

export class ImagePreparationCancelled extends Error {
  constructor() {
    super("Image preparation cancelled");
    this.name = "ImagePreparationCancelled";
  }
}

/** Larger files are not read into memory at all. */
export const CLIENT_READ_LIMIT_BYTES = 150_000_000;
/** Larger images are not decoded in the tab (memory); the user must resize. */
export const CLIENT_DECODE_LIMIT_PIXELS = 100_000_000;

const ENCODABLE: readonly ImageFormat[] = ["jpeg", "png", "webp"];
const QUALITY_STEPS = [0.92, 0.86, 0.8];
const SCALE_STEPS = [1, 0.85, 0.72, 0.6, 0.5];
/** Below these the loss is visible enough to ask the user first. */
const CONFIRM_BELOW_QUALITY = 0.86;
const CONFIRM_BELOW_SCALE = 0.75;

const FIXABLE = new Set<ImageInputIssue["code"]>(["too_large", "unsupported_format", "dimensions_too_large", "too_many_pixels"]);

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new ImagePreparationCancelled();
}

function issueFor(position: ImagePosition | null, code: ImageInputIssue["code"], message: string): ImageInputIssue {
  const named = position && position.count > 1 ? `${position.index + 1}. görsel: ` : "";
  return { code, index: position?.index ?? null, message: `${named}${message}` };
}

function candidateFormats(limits: ImageInputLimits, original: ImageFormat, hasAlpha: boolean) {
  const allowed = ENCODABLE.filter((format) => limits.formats.includes(format));
  const preference: ImageFormat[] = hasAlpha ? [original, "webp", "png"] : [original, "jpeg", "webp", "png"];
  const ordered = [...new Set(preference)].filter((format) => allowed.includes(format));
  if (!hasAlpha) return { formats: ordered.length ? ordered : allowed, flattens: false };
  const keepsAlpha = ordered.filter((format) => IMAGE_FORMATS[format].alpha);
  if (keepsAlpha.length) return { formats: keepsAlpha, flattens: false };
  return { formats: allowed, flattens: true };
}

/** Browsers commonly cannot decode these; the server checks their structure instead. */
const NOT_BROWSER_DECODABLE: ReadonlySet<ImageFormat> = new Set(["heic"]);

async function verifyDecodes(codec: ImageCodec, file: File, format: ImageFormat, knownOpaque: boolean, position: ImagePosition | null, signal?: AbortSignal) {
  if (NOT_BROWSER_DECODABLE.has(format)) return;
  try {
    if (codec.verify) await codec.verify(file);
    else (await codec.decode(file, knownOpaque)).close();
  } catch {
    throwIfAborted(signal);
    throw new ImagePreparationError([undecodableImageIssue(position)]);
  }
  throwIfAborted(signal);
}

function renamed(original: File, format: ImageFormat, blob: Blob): File {
  const base = original.name.replace(/\.[^.]+$/, "") || "image";
  const extension = format === "jpeg" ? "jpg" : format;
  return new File([blob], `${base}.${extension}`, { type: IMAGE_FORMATS[format].mime, lastModified: Date.now() });
}

export async function prepareImageForLimits(
  original: File,
  limits: ImageInputLimits,
  options: { codec: ImageCodec; signal?: AbortSignal; position?: ImagePosition | null }
): Promise<PreparedImage> {
  const { codec, signal } = options;
  const position = options.position ?? null;
  throwIfAborted(signal);

  if (original.size > CLIENT_READ_LIMIT_BYTES) {
    throw new ImagePreparationError([
      issueFor(position, "too_large", `Dosya ${formatBytesTr(original.size)}; tarayıcıda işlenebilecek en büyük dosya ${formatBytesTr(CLIENT_READ_LIMIT_BYTES)}.`),
    ]);
  }
  const probe = probeImage(new Uint8Array(await original.arrayBuffer()));
  throwIfAborted(signal);
  if (!probe.ok) throw new ImagePreparationError([unreadableImageIssue(position)]);

  const facts: ImageFacts = { bytes: original.size, probe: probe.image };
  const advisories = adviseImageFacts(facts, limits);
  const issues = checkImageFacts(facts, limits, position);
  if (issues.length === 0) {
    await verifyDecodes(codec, original, probe.image.format, probe.image.alpha === "no", position, signal);
    return { file: original, original, facts, transform: null, confirmationReasons: [], advisories };
  }
  const blocking = issues.filter((issue) => !FIXABLE.has(issue.code));
  if (blocking.length) throw new ImagePreparationError(blocking);

  const pixels = probe.image.width * probe.image.height;
  if (pixels > CLIENT_DECODE_LIMIT_PIXELS) {
    throw new ImagePreparationError([
      issueFor(position, "too_many_pixels", `Görsel ${Math.round(pixels / 1_000_000)} megapiksel; tarayıcıda güvenle küçültülemeyecek kadar büyük. Lütfen önce görseli küçültün.`),
    ]);
  }

  let decoded: DecodedImage;
  try {
    decoded = await codec.decode(original, probe.image.alpha === "no");
  } catch {
    throwIfAborted(signal);
    throw new ImagePreparationError([
      issueFor(position, "unsupported_format", `Bu tarayıcı ${IMAGE_FORMATS[probe.image.format].label} görselini açamıyor. Görseli JPEG veya PNG olarak kaydedip tekrar deneyin.`),
    ]);
  }

  try {
    throwIfAborted(signal);
    const { formats, flattens } = candidateFormats(limits, probe.image.format, decoded.hasAlpha);
    if (formats.length === 0) {
      throw new ImagePreparationError([
        issueFor(position, "unsupported_format", "Bu modelin kabul ettiği biçimlere tarayıcıda dönüştürme yapılamıyor."),
      ]);
    }
    const longest = Math.max(decoded.width, decoded.height);
    const baseScale = Math.min(
      1,
      limits.maxDimension ? limits.maxDimension / longest : 1,
      Math.sqrt(limits.maxPixels / (decoded.width * decoded.height))
    );

    for (const step of SCALE_STEPS) {
      const scale = baseScale * step;
      const width = Math.max(1, Math.round(decoded.width * scale));
      const height = Math.max(1, Math.round(decoded.height * scale));
      if (Math.min(width, height) < limits.minDimension) break;
      for (const format of formats) {
        const qualities = format === "png" ? [1] : QUALITY_STEPS;
        for (const quality of qualities) {
          throwIfAborted(signal);
          let blob: Blob;
          try {
            blob = await codec.encode(decoded, { width, height, format, quality });
          } catch {
            throwIfAborted(signal);
            break; // this browser cannot produce the format; try the next one
          }
          throwIfAborted(signal);
          if (blob.size > limits.maxBytes) continue;
          const file = renamed(original, format, blob);
          const outputFacts: ImageFacts = {
            bytes: blob.size,
            probe: { format, width, height, alpha: decoded.hasAlpha && !flattens ? "yes" : "no", animated: false },
          };
          const reasons: ConfirmationReason[] = [];
          if (flattens) reasons.push("transparency");
          if (scale < CONFIRM_BELOW_SCALE || (format !== "png" && quality < CONFIRM_BELOW_QUALITY)) reasons.push("quality");
          return {
            file,
            original,
            facts: outputFacts,
            transform: {
              fromFormat: probe.image.format,
              toFormat: format,
              fromWidth: decoded.width,
              fromHeight: decoded.height,
              toWidth: width,
              toHeight: height,
              scale,
              quality: format === "png" ? null : quality,
              transparencyFlattened: flattens,
              bytesBefore: original.size,
              bytesAfter: blob.size,
            },
            confirmationReasons: reasons,
            advisories: adviseImageFacts(outputFacts, limits),
          };
        }
      }
    }
    throw new ImagePreparationError([
      issueFor(position, "too_large", `Görsel, kalitesi korunarak bu modelin ${formatBytesTr(limits.maxBytes)} sınırına sığdırılamadı. Daha küçük bir görsel seçin.`),
    ]);
  } finally {
    decoded.close();
  }
}

/** Short Turkish description of what the optimizer changed. */
export function describeTransformTr(transform: ImageTransform): string {
  const parts: string[] = [];
  if (transform.fromFormat !== transform.toFormat) {
    parts.push(`${IMAGE_FORMATS[transform.fromFormat].label} → ${IMAGE_FORMATS[transform.toFormat].label}`);
  }
  if (transform.scale < 1) {
    parts.push(`${transform.fromWidth}×${transform.fromHeight} → ${transform.toWidth}×${transform.toHeight} piksel`);
  }
  parts.push(`${formatBytesTr(transform.bytesBefore)} → ${formatBytesTr(transform.bytesAfter)}`);
  if (transform.quality !== null) parts.push(`kalite %${Math.round(transform.quality * 100)}`);
  return parts.join(" · ");
}
