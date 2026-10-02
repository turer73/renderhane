/** Byte-level image headers for tests: real container layouts, no pixel data. */

function u32be(value: number) { return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]; }
function u32le(value: number) { return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]; }
function u24le(value: number) { return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255]; }
function u16le(value: number) { return [value & 255, (value >>> 8) & 255]; }
function ascii(text: string) { return [...text].map((char) => char.charCodeAt(0)); }

function pad(bytes: number[], totalBytes?: number): Uint8Array {
  const out = new Uint8Array(Math.max(bytes.length, totalBytes ?? 0));
  out.set(bytes);
  return out;
}

function pngChunk(type: string, data: number[]) {
  return [...u32be(data.length), ...ascii(type), ...data, 0, 0, 0, 0];
}

export function png(options: {
  width: number;
  height: number;
  colorType?: number;
  transparencyChunk?: boolean;
  animated?: boolean;
  imageData?: boolean;
  totalBytes?: number;
}): Uint8Array {
  const { width, height, colorType = 6, transparencyChunk = false, animated = false, imageData = true } = options;
  const bytes = [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...pngChunk("IHDR", [...u32be(width), ...u32be(height), 8, colorType, 0, 0, 0]),
    ...(animated ? pngChunk("acTL", [...u32be(2), ...u32be(0)]) : []),
    ...(transparencyChunk ? pngChunk("tRNS", [0, 0, 0, 0, 0, 0]) : []),
    ...(imageData ? pngChunk("IDAT", [0x78, 0x9c, 0x03, 0x00]) : []),
    ...pngChunk("IEND", []),
  ];
  return pad(bytes, options.totalBytes);
}

export function jpeg(options: { width: number; height: number; frameMarker?: number; exifBytes?: number; totalBytes?: number }): Uint8Array {
  const { width, height, frameMarker = 0xc0, exifBytes = 0 } = options;
  const exif = exifBytes > 0 ? [0xff, 0xe1, ((exifBytes + 2) >>> 8) & 255, (exifBytes + 2) & 255, ...new Array(exifBytes).fill(0)] : [];
  const bytes = [
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, ...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    ...exif,
    0xff, frameMarker, 0x00, 0x11, 8, (height >>> 8) & 255, height & 255, (width >>> 8) & 255, width & 255,
    3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    0xff, 0xda, 0x00, 0x0c, 3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0,
    0x00, 0xff, 0xd9,
  ];
  return pad(bytes, options.totalBytes);
}

function riff(chunkType: string, payload: number[]) {
  const chunk = [...ascii(chunkType), ...u32le(payload.length), ...payload];
  return [...ascii("RIFF"), ...u32le(4 + chunk.length), ...ascii("WEBP"), ...chunk];
}

export function webpExtended(options: { width: number; height: number; alpha: boolean; animated?: boolean }): Uint8Array {
  const flags = (options.alpha ? 0x10 : 0) | (options.animated ? 0x02 : 0);
  return pad(riff("VP8X", [flags, 0, 0, 0, ...u24le(options.width - 1), ...u24le(options.height - 1)]));
}

export function webpLossless(options: { width: number; height: number; alpha: boolean }): Uint8Array {
  const bits = ((options.width - 1) & 0x3fff) | (((options.height - 1) & 0x3fff) << 14) | ((options.alpha ? 1 : 0) << 28);
  return pad(riff("VP8L", [0x2f, ...u32le(bits >>> 0), 0, 0, 0, 0]));
}

export function webpLossy(options: { width: number; height: number }): Uint8Array {
  return pad(riff("VP8 ", [0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, ...u16le(options.width), ...u16le(options.height), 0, 0]));
}

export function gif(options: { width: number; height: number }): Uint8Array {
  return pad([...ascii("GIF89a"), ...u16le(options.width), ...u16le(options.height), 0, 0, 0, 0x3b]);
}

export function bmp(options: { width: number; height: number; bitsPerPixel?: number }): Uint8Array {
  return pad([
    ...ascii("BM"), ...u32le(54), 0, 0, 0, 0, ...u32le(54),
    ...u32le(40), ...u32le(options.width), ...u32le(options.height), ...u16le(1), ...u16le(options.bitsPerPixel ?? 24),
    ...new Array(24).fill(0),
  ]);
}

export function isoImage(options: { brand: "avif" | "heic"; extents: Array<[number, number]> }): Uint8Array {
  const ftyp = [...u32be(24), ...ascii("ftyp"), ...ascii(options.brand), ...u32be(0), ...ascii("mif1"), ...ascii(options.brand)];
  const ispe = options.extents.flatMap(([width, height]) => [...u32be(20), ...ascii("ispe"), ...u32be(0), ...u32be(width), ...u32be(height)]);
  return pad([...ftyp, ...u32be(8 + ispe.length), ...ascii("meta"), ...ispe]);
}

export function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
