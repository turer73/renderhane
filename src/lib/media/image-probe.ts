import type { ImageFormat } from "./image-input-contract";

/**
 * Header-only image inspection. It identifies the real format from magic
 * bytes (the declared MIME type is never trusted) and reads dimensions
 * without decoding pixels, so a decompression bomb is refused by its header.
 * Runs unchanged in the browser and on the server.
 */

export interface ImageProbe {
  format: ImageFormat;
  width: number;
  height: number;
  /**
   * "yes": the header declares transparency. "maybe": the format can carry
   * transparency the header does not reveal. "no": the image is opaque.
   */
  alpha: "yes" | "maybe" | "no";
  animated: boolean;
}

export type ImageProbeResult =
  | { ok: true; image: ImageProbe }
  | { ok: false; reason: "unsupported" | "corrupt" };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset + length > bytes.length) return "";
  let out = "";
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i]);
  return out;
}

function u16be(b: Uint8Array, o: number) { return (b[o] << 8) | b[o + 1]; }
function u16le(b: Uint8Array, o: number) { return b[o] | (b[o + 1] << 8); }
function u24le(b: Uint8Array, o: number) { return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16); }
function u32be(b: Uint8Array, o: number) { return ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]); }
function u32le(b: Uint8Array, o: number) { return ((b[o + 3] << 24) >>> 0) + ((b[o + 2] << 16) | (b[o + 1] << 8) | b[o]); }
function i32le(b: Uint8Array, o: number) { return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24); }

function result(format: ImageFormat, width: number, height: number, alpha: ImageProbe["alpha"], animated = false): ImageProbeResult {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    return { ok: false, reason: "corrupt" };
  }
  return { ok: true, image: { format, width, height, alpha, animated } };
}

function probePng(b: Uint8Array): ImageProbeResult {
  if (b.length < 33 || ascii(b, 12, 4) !== "IHDR" || u32be(b, 8) !== 13) return { ok: false, reason: "corrupt" };
  const width = u32be(b, 16);
  const height = u32be(b, 20);
  const colorType = b[25];
  if (![0, 2, 3, 4, 6].includes(colorType)) return { ok: false, reason: "corrupt" };
  let alpha: ImageProbe["alpha"] = colorType === 4 || colorType === 6 ? "yes" : "no";
  let animated = false;
  // tRNS (transparency) and acTL (animation) must precede the first IDAT.
  let offset = 8;
  let reachedImageData = false;
  while (offset + 8 <= b.length) {
    const length = u32be(b, offset);
    const type = ascii(b, offset + 4, 4);
    if (type === "IDAT") { reachedImageData = true; break; }
    if (type === "tRNS") alpha = "yes";
    if (type === "acTL") animated = true;
    offset += 12 + length;
  }
  if (!reachedImageData) return { ok: false, reason: "corrupt" };
  return result("png", width, height, alpha, animated);
}

function isJpegFrameMarker(marker: number) {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function probeJpeg(b: Uint8Array): ImageProbeResult {
  let offset = 2;
  while (offset + 4 <= b.length) {
    if (b[offset] !== 0xff) return { ok: false, reason: "corrupt" };
    const marker = b[offset + 1];
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { offset += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return { ok: false, reason: "corrupt" };
    const length = u16be(b, offset + 2);
    if (length < 2) return { ok: false, reason: "corrupt" };
    if (isJpegFrameMarker(marker)) {
      if (offset + 9 > b.length) return { ok: false, reason: "corrupt" };
      return result("jpeg", u16be(b, offset + 7), u16be(b, offset + 5), "no");
    }
    offset += 2 + length;
  }
  return { ok: false, reason: "corrupt" };
}

function probeWebp(b: Uint8Array): ImageProbeResult {
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") {
    if (b.length < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return { ok: false, reason: "corrupt" };
    return result("webp", u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff, "no");
  }
  if (chunk === "VP8L") {
    if (b.length < 25 || b[20] !== 0x2f) return { ok: false, reason: "corrupt" };
    const bits = u32le(b, 21);
    const alphaUsed = ((bits >>> 28) & 1) === 1;
    return result("webp", (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1, alphaUsed ? "yes" : "no");
  }
  if (chunk === "VP8X") {
    if (b.length < 30) return { ok: false, reason: "corrupt" };
    const flags = b[20];
    return result("webp", u24le(b, 24) + 1, u24le(b, 27) + 1, flags & 0x10 ? "yes" : "no", (flags & 0x02) !== 0);
  }
  return { ok: false, reason: "corrupt" };
}

function probeGif(b: Uint8Array): ImageProbeResult {
  if (b.length < 10) return { ok: false, reason: "corrupt" };
  return result("gif", u16le(b, 6), u16le(b, 8), "maybe");
}

function probeBmp(b: Uint8Array): ImageProbeResult {
  if (b.length < 26) return { ok: false, reason: "corrupt" };
  const headerSize = u32le(b, 14);
  if (headerSize === 12) return result("bmp", u16le(b, 18), u16le(b, 20), "no");
  if (headerSize < 40 || b.length < 30) return { ok: false, reason: "corrupt" };
  const bitsPerPixel = u16le(b, 28);
  return result("bmp", i32le(b, 18), Math.abs(i32le(b, 22)), bitsPerPixel === 32 ? "maybe" : "no");
}

const AVIF_BRANDS = new Set(["avif", "avis"]);
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

function probeIsoBmff(b: Uint8Array): ImageProbeResult {
  const boxSize = u32be(b, 0);
  if (boxSize < 16 || boxSize > b.length) return { ok: false, reason: "corrupt" };
  const brands = [ascii(b, 8, 4)];
  for (let o = 16; o + 4 <= boxSize; o += 4) brands.push(ascii(b, o, 4));
  const format: ImageFormat | null = brands.some((brand) => AVIF_BRANDS.has(brand))
    ? "avif"
    : brands.some((brand) => HEIC_BRANDS.has(brand))
      ? "heic"
      : null;
  if (!format) return { ok: false, reason: "unsupported" };
  // The full image is the largest image-spatial-extents ('ispe') property;
  // smaller ones describe grid tiles or thumbnails.
  let width = 0;
  let height = 0;
  for (let o = 4; o + 16 <= b.length; o++) {
    if (b[o] !== 0x69 || ascii(b, o, 4) !== "ispe") continue;
    const w = u32be(b, o + 8);
    const h = u32be(b, o + 12);
    if (w * h > width * height) { width = w; height = h; }
  }
  return result(format, width, height, "maybe");
}

export function probeImage(bytes: Uint8Array): ImageProbeResult {
  if (bytes.length < 12) return { ok: false, reason: bytes.length === 0 ? "corrupt" : "unsupported" };
  if (PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return probePng(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return probeJpeg(bytes);
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return probeWebp(bytes);
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return probeGif(bytes);
  if (ascii(bytes, 0, 2) === "BM") return probeBmp(bytes);
  if (ascii(bytes, 4, 4) === "ftyp") return probeIsoBmff(bytes);
  return { ok: false, reason: "unsupported" };
}
