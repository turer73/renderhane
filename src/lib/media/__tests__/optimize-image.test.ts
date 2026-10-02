import { describe, expect, it, vi } from "vitest";
import { getImageInputLimits, type ImageFormat, type ImageInputLimits } from "../image-input-contract";
import {
  ImagePreparationCancelled,
  ImagePreparationError,
  prepareImageForLimits,
  type DecodedImage,
  type EncodeTarget,
  type ImageCodec,
} from "../optimize-image";
import { gif, jpeg, png, textBytes, webpExtended } from "./image-fixtures";

const MIME: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** A file whose header says one thing and whose reported size is chosen freely. */
function fileOf(header: Uint8Array, size: number, name = "photo.png", type = "image/png"): File {
  const bytes = new Uint8Array(Math.max(size, header.length));
  bytes.set(header);
  return new File([bytes], name, { type });
}

interface FakeCodecOptions {
  width: number;
  height: number;
  hasAlpha?: boolean;
  /** Encoded size for a target; defaults to a simple bits-per-pixel model. */
  sizeOf?: (target: EncodeTarget) => number;
  unsupported?: ImageFormat[];
  failDecode?: boolean;
  onEncode?: (target: EncodeTarget) => void;
}

function fakeCodec(options: FakeCodecOptions): ImageCodec & { encodes: EncodeTarget[]; closed: number } {
  const encodes: EncodeTarget[] = [];
  const codec = {
    encodes,
    closed: 0,
    async decode(): Promise<DecodedImage> {
      if (options.failDecode) throw new Error("decode failed");
      return { width: options.width, height: options.height, hasAlpha: options.hasAlpha ?? false, close: () => { codec.closed++; } };
    },
    async encode(_image: DecodedImage, target: EncodeTarget): Promise<Blob> {
      encodes.push(target);
      options.onEncode?.(target);
      if (options.unsupported?.includes(target.format)) throw new Error("unsupported");
      const bitsPerPixel = target.format === "png" ? 12 : 8 * target.quality;
      const size = options.sizeOf?.(target) ?? Math.round((target.width * target.height * bitsPerPixel) / 8 / 10);
      return new Blob([new Uint8Array(size)], { type: MIME[target.format] });
    },
  };
  return codec;
}

function limitsWith(overrides: Partial<ImageInputLimits>, base = "trellis-v1"): ImageInputLimits {
  return { ...getImageInputLimits(base), ...overrides };
}

describe("prepareImageForLimits", () => {
  it("returns a fitting image untouched, without decoding it", async () => {
    const codec = fakeCodec({ width: 1024, height: 1024 });
    const original = fileOf(png({ width: 1024, height: 1024 }), 5_242_880);

    const prepared = await prepareImageForLimits(original, limitsWith({ maxBytes: 5_242_880 }), { codec });

    expect(prepared.file).toBe(original);
    expect(prepared.transform).toBeNull();
    expect(codec.encodes).toHaveLength(0);
  });

  it("optimizes a file one byte over 5,242,880 and keeps the original", async () => {
    const codec = fakeCodec({ width: 2000, height: 2000, sizeOf: () => 3_000_000 });
    const original = fileOf(jpeg({ width: 2000, height: 2000 }), 5_242_881, "photo.jpg", "image/jpeg");

    const prepared = await prepareImageForLimits(original, limitsWith({ maxBytes: 5_242_880 }), { codec });

    expect(prepared.original).toBe(original);
    expect(prepared.file).not.toBe(original);
    expect(prepared.file.size).toBe(3_000_000);
    expect(prepared.transform).toMatchObject({ fromFormat: "jpeg", toFormat: "jpeg", scale: 1, quality: 0.92 });
    expect(prepared.confirmationReasons).toEqual([]);
  });

  it("keeps a large transparent PNG transparent by choosing an alpha-capable format", async () => {
    const codec = fakeCodec({ width: 4000, height: 4000, hasAlpha: true, sizeOf: (t) => (t.format === "png" && t.width > 3000 ? 30_000_000 : 6_000_000) });
    const original = fileOf(png({ width: 4000, height: 4000, colorType: 6 }), 30_000_000);

    const prepared = await prepareImageForLimits(original, getImageInputLimits("meshy-v71"), { codec });

    expect(prepared.transform?.toFormat).toBe("png");
    expect(prepared.transform?.transparencyFlattened).toBe(false);
    expect(prepared.facts.probe.alpha).toBe("yes");
    expect(codec.encodes.every((target) => target.format !== "jpeg")).toBe(true);
  });

  it("never drops transparency silently: flattening requires the user's confirmation", async () => {
    const codec = fakeCodec({ width: 1500, height: 1500, hasAlpha: true, sizeOf: () => 2_000_000 });
    const original = fileOf(webpExtended({ width: 1500, height: 1500, alpha: true }), 2_000_000, "logo.webp", "image/webp");

    const prepared = await prepareImageForLimits(original, limitsWith({ formats: ["jpeg"] }), { codec });

    expect(prepared.transform).toMatchObject({ toFormat: "jpeg", transparencyFlattened: true });
    expect(prepared.confirmationReasons).toContain("transparency");
  });

  it("asks before a visible quality or resolution loss", async () => {
    const codec = fakeCodec({ width: 6000, height: 4000, sizeOf: (t) => (t.width >= 4000 ? 30_000_000 : 7_000_000) });
    const original = fileOf(jpeg({ width: 6000, height: 4000 }), 25_000_000, "big.jpg", "image/jpeg");

    const prepared = await prepareImageForLimits(original, limitsWith({ maxBytes: 8_000_000 }), { codec });

    expect(prepared.transform!.scale).toBeLessThan(0.75);
    expect(prepared.confirmationReasons).toEqual(["quality"]);
  });

  it("converts a format the model rejects when the browser can decode it", async () => {
    const codec = fakeCodec({ width: 800, height: 800 });
    const original = fileOf(gif({ width: 800, height: 800 }), 300_000, "anim.gif", "image/gif");

    const prepared = await prepareImageForLimits(original, getImageInputLimits("meshy-v71"), { codec });

    expect(prepared.transform).toMatchObject({ fromFormat: "gif", toFormat: "jpeg" });
    expect(prepared.file.type).toBe("image/jpeg");
    expect(prepared.file.name).toBe("anim.jpg");
  });

  it("falls back to the next format when the browser cannot encode one", async () => {
    const codec = fakeCodec({ width: 1000, height: 1000, hasAlpha: true, unsupported: ["webp"] });
    const original = fileOf(webpExtended({ width: 1000, height: 1000, alpha: true }), 21_000_000, "x.webp", "image/webp");

    const prepared = await prepareImageForLimits(original, limitsWith({ formats: ["webp", "png"], maxBytes: 20_000_000 }), { codec });

    expect(prepared.transform?.toFormat).toBe("png");
  });

  it("rejects corrupt bytes and a non-image disguised with an image name and type", async () => {
    const codec = fakeCodec({ width: 1, height: 1 });
    const disguised = fileOf(textBytes("%PDF-1.7 fake"), 1000, "photo.png", "image/png");
    const truncated = fileOf(png({ width: 10, height: 10, imageData: false }), 40);

    for (const file of [disguised, truncated]) {
      await expect(prepareImageForLimits(file, limitsWith({}), { codec })).rejects.toMatchObject({
        issues: [expect.objectContaining({ code: "corrupt" })],
      });
    }
  });

  it("trusts the bytes over the declared type", async () => {
    const codec = fakeCodec({ width: 1200, height: 900 });
    const jpegNamedPng = fileOf(jpeg({ width: 1200, height: 900 }), 400_000, "photo.png", "image/png");

    const prepared = await prepareImageForLimits(jpegNamedPng, getImageInputLimits("recraft-crisp-upscale"), { codec });

    expect(prepared.transform?.fromFormat).toBe("jpeg");
    expect(prepared.transform?.toFormat).toBe("png");
  });

  it("does not upscale: a too-small image is rejected", async () => {
    const codec = fakeCodec({ width: 40, height: 40 });
    const tiny = fileOf(png({ width: 40, height: 40 }), 2000);

    await expect(prepareImageForLimits(tiny, limitsWith({}), { codec })).rejects.toMatchObject({
      issues: [expect.objectContaining({ code: "dimensions_too_small" })],
    });
    expect(codec.encodes).toHaveLength(0);
  });

  it("explains when the browser cannot open the format", async () => {
    const codec = fakeCodec({ width: 1, height: 1, failDecode: true });
    const heic = fileOf(new Uint8Array([0, 0, 0, 24, ...[..."ftypheic"].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, ...[..."mif1heic"].map((c) => c.charCodeAt(0)), 0, 0, 0, 28, ...[..."metaispe"].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, 0, 0, 15, 192, 0, 0, 11, 208]), 3_000_000, "IMG.heic", "image/heic");

    const error = await prepareImageForLimits(heic, limitsWith({}), { codec }).catch((e) => e);

    expect(error).toBeInstanceOf(ImagePreparationError);
    expect((error as ImagePreparationError).issues[0].message).toContain("HEIC/HEIF");
  });

  it("reports an image that cannot fit at an acceptable size", async () => {
    const codec = fakeCodec({ width: 3000, height: 3000, sizeOf: () => 9_000_000 });
    const original = fileOf(jpeg({ width: 3000, height: 3000 }), 9_000_000, "x.jpg", "image/jpeg");

    await expect(prepareImageForLimits(original, limitsWith({ maxBytes: 1_000_000 }), { codec })).rejects.toMatchObject({
      issues: [expect.objectContaining({ code: "too_large" })],
    });
    expect(codec.closed).toBe(1);
  });

  it("can be cancelled mid-optimization and releases the decoded image", async () => {
    const controller = new AbortController();
    const codec = fakeCodec({ width: 3000, height: 3000, sizeOf: () => 9_000_000, onEncode: () => controller.abort() });
    const original = fileOf(jpeg({ width: 3000, height: 3000 }), 9_000_000, "x.jpg", "image/jpeg");

    await expect(
      prepareImageForLimits(original, limitsWith({ maxBytes: 1_000_000 }), { codec, signal: controller.signal })
    ).rejects.toBeInstanceOf(ImagePreparationCancelled);
    expect(codec.encodes).toHaveLength(1);
    expect(codec.closed).toBe(1);
  });

  it("retries from the original: a model change re-optimizes the original, not the previous output", async () => {
    const decode = vi.fn();
    const codec = fakeCodec({ width: 3000, height: 3000, sizeOf: (t) => (t.format === "png" ? 9_000_000 : 4_000_000) });
    const wrapped: ImageCodec = { decode: async (file, opaque) => { decode(file); return codec.decode(file, opaque); }, encode: codec.encode };
    const original = fileOf(png({ width: 3000, height: 3000, colorType: 2 }), 9_000_000);

    const forTrellis = await prepareImageForLimits(original, limitsWith({ maxBytes: 5_000_000 }), { codec: wrapped });
    const forRecraft = await prepareImageForLimits(forTrellis.original, getImageInputLimits("recraft-crisp-upscale"), { codec: wrapped });

    expect(decode.mock.calls.map(([file]) => file)).toEqual([original]);
    expect(forRecraft.file).toBe(original);
  });

  it("names the image in a multi-image request", async () => {
    const codec = fakeCodec({ width: 40, height: 40 });
    const error = (await prepareImageForLimits(fileOf(png({ width: 40, height: 40 }), 2000), limitsWith({}), {
      codec,
      position: { index: 2, count: 4 },
    }).catch((e: unknown) => e)) as ImagePreparationError;
    expect(error.issues[0]).toMatchObject({ index: 2 });
    expect(error.issues[0].message.startsWith("3. görsel: ")).toBe(true);
  });
});
