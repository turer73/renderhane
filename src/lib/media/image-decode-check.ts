import "server-only";

import sharp from "sharp";
import { IMAGE_MAX_PIXELS } from "./image-formats";
import type { ImageProbe } from "./image-probe";

/**
 * A header can describe an image whose pixel data is missing, cut short or
 * broken. Before any spend, the server therefore decodes every accepted
 * image once, bounded in pixels and time. libvips fails on errors and
 * truncation but tolerates warnings, as providers' own decoders do: data that
 * decodes (even to noise) is passed on, data that does not is rejected.
 *
 * The prebuilt decoder cannot read HEIC (HEVC) or BMP; those get a
 * structural check instead (every box or pixel row is present).
 */

export type ImageDataCheck = "decoded" | "structural" | "failed" | "timeout";

const DECODE_TIMEOUT_SECONDS = 10;

function u32be(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}
function u32le(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}
function i32le(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
}
function u16le(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}
function boxType(bytes: Uint8Array, offset: number) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

/** Uncompressed BMP: the whole pixel array must be in the file. */
export function bmpPixelsPresent(bytes: Uint8Array): boolean {
  if (bytes.length < 54) return false;
  const dataOffset = u32le(bytes, 10);
  const width = i32le(bytes, 18);
  const height = Math.abs(i32le(bytes, 22));
  const bitsPerPixel = u16le(bytes, 28);
  const compression = u32le(bytes, 30);
  // BI_RGB, BI_BITFIELDS, BI_ALPHABITFIELDS; RLE and embedded JPEG/PNG are not accepted.
  if (![0, 3, 6].includes(compression) || ![1, 4, 8, 16, 24, 32].includes(bitsPerPixel)) return false;
  if (width <= 0 || height <= 0) return false;
  const rowBytes = Math.floor((bitsPerPixel * width + 31) / 32) * 4;
  return dataOffset >= 26 && dataOffset + rowBytes * height <= bytes.length;
}

/** HEIC: every top-level box fits the file and coded image data is present. */
export function heicStructureOk(bytes: Uint8Array): boolean {
  let offset = 0;
  let sawMeta = false;
  let mediaBytes = 0;
  while (offset + 8 <= bytes.length) {
    let size = u32be(bytes, offset);
    const type = boxType(bytes, offset + 4);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > bytes.length) return false;
      const high = u32be(bytes, offset + 8);
      if (high !== 0) return false; // larger than 4 GiB: far beyond any image limit
      size = u32be(bytes, offset + 12);
      header = 16;
    } else if (size === 0) {
      size = bytes.length - offset;
    }
    if (size < header || offset + size > bytes.length) return false;
    if (offset === 0 && type !== "ftyp") return false;
    if (type === "meta") sawMeta = true;
    if (type === "mdat") mediaBytes += size - header;
    offset += size;
  }
  return offset === bytes.length && sawMeta && mediaBytes > 0;
}

/** Decode once (first frame, bounded) or check structure where decoding is not available. */
export async function verifyImageData(bytes: Uint8Array, image: Pick<ImageProbe, "format">): Promise<ImageDataCheck> {
  if (image.format === "heic") return heicStructureOk(bytes) ? "structural" : "failed";
  if (image.format === "bmp") return bmpPixelsPresent(bytes) ? "structural" : "failed";
  try {
    await sharp(bytes, { failOn: "error", limitInputPixels: IMAGE_MAX_PIXELS, sequentialRead: true, pages: 1 })
      .timeout({ seconds: DECODE_TIMEOUT_SECONDS })
      .resize(16, 16, { fit: "inside" })
      .raw()
      .toBuffer();
    return "decoded";
  } catch (error) {
    return error instanceof Error && /timeout/i.test(error.message) ? "timeout" : "failed";
  }
}
