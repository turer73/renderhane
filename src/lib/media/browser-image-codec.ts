import { IMAGE_FORMATS } from "./image-input-contract";
import type { DecodedImage, EncodeTarget, ImageCodec } from "./optimize-image";

/**
 * Canvas implementation of ImageCodec for the browser. createImageBitmap
 * applies EXIF orientation, so re-encoded output is upright even where the
 * original relied on an orientation tag.
 */

interface BitmapImage extends DecodedImage {
  bitmap: ImageBitmap;
}

const ALPHA_SAMPLE_EDGE = 256;

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

function createCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: AnyCanvas, alpha: boolean) {
  const context = canvas.getContext("2d", { alpha }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) throw new Error("2D canvas is unavailable");
  return context;
}

async function toBlob(canvas: AnyCanvas, type: string, quality: number): Promise<Blob | null> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** A downscaled sample keeps partial alpha wherever the original had any. */
function detectAlpha(bitmap: ImageBitmap): boolean {
  const scale = Math.min(1, ALPHA_SAMPLE_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = createCanvas(width, height);
  const context = context2d(canvas, true);
  context.drawImage(bitmap, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

export const browserImageCodec: ImageCodec = {
  async decode(file: Blob, knownOpaque: boolean): Promise<DecodedImage> {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const image: BitmapImage = {
      bitmap,
      width: bitmap.width,
      height: bitmap.height,
      hasAlpha: knownOpaque ? false : detectAlpha(bitmap),
      close: () => bitmap.close(),
    };
    return image;
  },

  async encode(image: DecodedImage, target: EncodeTarget): Promise<Blob> {
    const { bitmap } = image as BitmapImage;
    const mime = IMAGE_FORMATS[target.format].mime;
    const opaque = !IMAGE_FORMATS[target.format].alpha;
    const canvas = createCanvas(target.width, target.height);
    const context = context2d(canvas, !opaque);
    if (opaque) {
      // Transparent input reaches an opaque format only as a flattened
      // preview that the user must accept before it is uploaded.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, target.width, target.height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, target.width, target.height);
    const blob = await toBlob(canvas, mime, target.quality);
    // Some browsers silently fall back to PNG for an unsupported type.
    if (!blob || blob.type !== mime) throw new Error(`Encoding to ${mime} is not supported`);
    return blob;
  },
};
