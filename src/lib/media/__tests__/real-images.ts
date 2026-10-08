import sharp from "sharp";

/**
 * Decodable test images, encoded by the same libvips build the server uses
 * to verify pixel data. Header-only fixtures (image-fixtures.ts) are not
 * images: since the server decodes, only these pass the full preflight.
 */

type EncodableFormat = "png" | "jpeg" | "webp" | "gif" | "avif";

function pattern(width: number, height: number, channels: number): Buffer {
  const data = Buffer.alloc(width * height * channels);
  for (let i = 0; i < data.length; i++) data[i] = (i * 2654435761) >>> 24;
  return data;
}

export async function realImage(format: EncodableFormat, width: number, height: number, options: { alpha?: boolean } = {}): Promise<Uint8Array> {
  const channels = options.alpha ? 4 : 3;
  const image = sharp(pattern(width, height, channels), { raw: { width, height, channels } });
  const encoded = format === "png" ? image.png()
    : format === "jpeg" ? image.jpeg({ quality: 85 })
      : format === "webp" ? image.webp({ quality: 80 })
        : format === "gif" ? image.gif()
          : image.avif({ quality: 50 });
  return new Uint8Array(await encoded.toBuffer());
}

/** The first part of a file, as left by an interrupted upload. */
export function truncated(bytes: Uint8Array, fraction = 0.5): Uint8Array {
  return bytes.slice(0, Math.floor(bytes.length * fraction));
}

function u32be(value: number) { return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]; }
function u32le(value: number) { return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]; }
function u16le(value: number) { return [value & 255, (value >>> 8) & 255]; }
function ascii(text: string) { return [...text].map((char) => char.charCodeAt(0)); }

/** A HEIC container with all boxes present and coded data in mdat (not decodable here; structure only). */
export function heicContainer(width: number, height: number, mediaBytes = 2048): Uint8Array {
  const ftyp = [...u32be(24), ...ascii("ftyp"), ...ascii("heic"), ...u32be(0), ...ascii("mif1"), ...ascii("heic")];
  const ispe = [...u32be(20), ...ascii("ispe"), ...u32be(0), ...u32be(width), ...u32be(height)];
  const meta = [...u32be(8 + ispe.length), ...ascii("meta"), ...ispe];
  const mdat = [...u32be(8 + mediaBytes), ...ascii("mdat"), ...new Array(mediaBytes).fill(7)];
  return new Uint8Array([...ftyp, ...meta, ...mdat]);
}

/** An uncompressed 24-bit BMP with its full pixel array. */
export function bmpWithPixels(width: number, height: number): Uint8Array {
  const rowBytes = Math.floor((24 * width + 31) / 32) * 4;
  const pixels = rowBytes * height;
  return new Uint8Array([
    ...ascii("BM"), ...u32le(54 + pixels), 0, 0, 0, 0, ...u32le(54),
    ...u32le(40), ...u32le(width), ...u32le(height), ...u16le(1), ...u16le(24), ...u32le(0), ...u32le(pixels),
    ...new Array(16).fill(0),
    ...new Array(pixels).fill(128),
  ]);
}
