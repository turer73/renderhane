import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

const mocks = vi.hoisted(() => ({ openPublicDownload: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/security/safe-download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/safe-download")>();
  return { ...actual, openPublicDownload: mocks.openPublicDownload };
});

import { DownloadTooLargeError, UnsafeDownloadUrlError } from "@/lib/security/safe-download";
import { getImageInputLimits, type ImageFormat } from "../image-input-contract";
import { ImagePreflightError, imagePreflightErrorBody, preflightImageInputs, type ImageFactsCache } from "../image-preflight";
import { bmp, gif, isoImage, jpeg, png, textBytes, webpExtended } from "./image-fixtures";
import { bmpWithPixels, heicContainer, realImage, truncated } from "./real-images";

const SIGNED_URL = "https://project.supabase.co/storage/v1/object/sign/uploads/user-1/a.png?token=SECRET-TOKEN";

function serve(bytes: Uint8Array, statusCode = 200) {
  const response = Object.assign(Readable.from([Buffer.from(bytes)]), { statusCode, headers: {}, complete: true });
  return { response, finalUrl: new URL(SIGNED_URL), contentLength: bytes.byteLength, close: vi.fn() };
}

async function rejection(promise: Promise<unknown>): Promise<ImagePreflightError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ImagePreflightError) return error;
    throw error;
  }
  throw new Error("expected ImagePreflightError");
}

describe("preflightImageInputs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the real bytes and returns facts for an acceptable image", async () => {
    mocks.openPublicDownload.mockResolvedValue(serve(await realImage("png", 1024, 1024)));

    const facts = await preflightImageInputs({ urls: [SIGNED_URL], limits: getImageInputLimits("trellis-v1") });

    expect(facts).toEqual([{ bytes: expect.any(Number), probe: expect.objectContaining({ format: "png", width: 1024 }) }]);
    expect(mocks.openPublicDownload).toHaveBeenCalledWith(SIGNED_URL, expect.objectContaining({
      maxBytes: getImageInputLimits("trellis-v1").maxBytes,
      timeoutMs: 15_000,
      maxRedirects: 2,
    }));
  });

  it("bounds the read by the model's byte limit and reports a too-large file", async () => {
    mocks.openPublicDownload.mockRejectedValue(new DownloadTooLargeError(8_000_000));

    const error = await rejection(preflightImageInputs({ urls: [SIGNED_URL], limits: getImageInputLimits("hunyuan3d-v31-pro") }));

    expect(error.issues).toEqual([expect.objectContaining({ code: "too_large", index: 0 })]);
    expect(error.issues[0].message).toContain("en fazla 8 MB");
  });

  it("explains an expired or unsafe link without echoing the URL or its token", async () => {
    mocks.openPublicDownload.mockResolvedValueOnce(serve(textBytes("<Error>expired</Error>"), 400));
    const expired = await rejection(preflightImageInputs({ urls: [SIGNED_URL], limits: getImageInputLimits("wan-i2v") }));
    mocks.openPublicDownload.mockRejectedValueOnce(new UnsafeDownloadUrlError());
    const unsafe = await rejection(preflightImageInputs({ urls: ["https://10.0.0.5/x.png"], limits: getImageInputLimits("wan-i2v") }));

    for (const error of [expired, unsafe]) {
      expect(error.issues[0].code).toBe("unreachable");
      expect(JSON.stringify(imagePreflightErrorBody(error))).not.toMatch(/SECRET-TOKEN|supabase|10\.0\.0\.5/);
    }
  });

  it("reports a timeout separately from an unreachable link", async () => {
    mocks.openPublicDownload.mockRejectedValue(new Error("Download timed out"));
    const error = await rejection(preflightImageInputs({ urls: [SIGNED_URL], limits: getImageInputLimits("wan-i2v") }));
    expect(error.issues[0].code).toBe("timeout");
  });

  it("rejects corrupt bytes and a non-image disguised with an image name or type", async () => {
    mocks.openPublicDownload
      .mockResolvedValueOnce(serve(png({ width: 50, height: 50, imageData: false })))
      .mockResolvedValueOnce(serve(textBytes("%PDF-1.7 not an image")));

    const error = await rejection(preflightImageInputs({
      urls: [SIGNED_URL, "https://cdn.example.com/photo.png"],
      limits: getImageInputLimits("tripo-v25-mv"),
    }));

    expect(error.issues.map((issue) => [issue.code, issue.index])).toEqual([["corrupt", 0], ["corrupt", 1]]);
    expect(error.issues[1].message.startsWith("2. görsel: ")).toBe(true);
  });

  it.each([
    ["a PNG header with no pixel data", async () => png({ width: 512, height: 512 })],
    ["a JPEG header with an empty scan", async () => jpeg({ width: 512, height: 512 })],
    ["a WebP VP8X header without an image chunk", async () => webpExtended({ width: 512, height: 512, alpha: false })],
    ["an AVIF with boxes but no coded data", async () => isoImage({ brand: "avif", extents: [[512, 512]] })],
    ["a JPEG cut in half", async () => truncated(await realImage("jpeg", 640, 480))],
    ["a PNG cut in half", async () => truncated(await realImage("png", 640, 480, { alpha: true }))],
    ["a WebP cut in half", async () => truncated(await realImage("webp", 640, 480))],
  ])("decodes before accepting: rejects %s and does not cache it", async (_label, make) => {
    const bytes = await make();
    mocks.openPublicDownload.mockResolvedValue(serve(bytes));
    const cache: ImageFactsCache = new Map();

    // Every format is allowed here, so only the pixel data can reject the file.
    const limits = { ...getImageInputLimits("wan-i2v"), formats: ["jpeg", "png", "webp", "avif"] as ImageFormat[] };
    const error = await rejection(preflightImageInputs({ urls: [SIGNED_URL], limits, cache }));

    expect(error.issues).toEqual([expect.objectContaining({ code: "corrupt", index: 0 })]);
    expect(error.issues[0].message).toMatch(/çözülemedi|okunamadı/);
    expect(cache.size).toBe(0);
  });

  it("accepts every format that decodes, including the first frame of a GIF", async () => {
    for (const format of ["png", "jpeg", "webp", "gif", "avif"] as const) {
      mocks.openPublicDownload.mockResolvedValueOnce(serve(await realImage(format, 320, 240, { alpha: format === "png" })));
      const limits = { ...getImageInputLimits("wan-i2v"), formats: [format] };
      await expect(preflightImageInputs({ urls: [SIGNED_URL], limits })).resolves.toEqual([
        expect.objectContaining({ probe: expect.objectContaining({ format, width: 320, height: 240 }) }),
      ]);
    }
  });

  it("checks HEIC and BMP structure where the server cannot decode them", async () => {
    mocks.openPublicDownload
      .mockResolvedValueOnce(serve(heicContainer(1024, 1024)))
      .mockResolvedValueOnce(serve(isoImage({ brand: "heic", extents: [[1024, 1024]] })));
    await expect(preflightImageInputs({ urls: [SIGNED_URL], limits: getImageInputLimits("meshy-v71") })).resolves.toHaveLength(1);
    expect((await rejection(preflightImageInputs({ urls: [SIGNED_URL], limits: getImageInputLimits("meshy-v71") }))).issues[0].code).toBe("corrupt");

    mocks.openPublicDownload
      .mockResolvedValueOnce(serve(bmpWithPixels(300, 200)))
      .mockResolvedValueOnce(serve(bmp({ width: 300, height: 200 })));
    await expect(preflightImageInputs({ urls: [SIGNED_URL], limits: getImageInputLimits("wan-i2v") })).resolves.toHaveLength(1);
    expect((await rejection(preflightImageInputs({ urls: [SIGNED_URL], limits: getImageInputLimits("wan-i2v") }))).issues[0].code).toBe("corrupt");
  });

  it("rejects a format the model does not accept", async () => {
    mocks.openPublicDownload.mockResolvedValue(serve(gif({ width: 800, height: 800 })));
    const error = await rejection(preflightImageInputs({ urls: [SIGNED_URL], limits: getImageInputLimits("meshy-v71") }));
    expect(error.issues[0]).toMatchObject({ code: "unsupported_format" });
    expect(error.issues[0].message).toContain("JPEG, PNG, AVIF veya HEIC/HEIF");
  });

  it("rejects too many images before downloading any of them", async () => {
    const error = await rejection(preflightImageInputs({
      urls: [SIGNED_URL, SIGNED_URL],
      limits: getImageInputLimits("wan-i2v"),
    }));
    expect(error.issues[0].code).toBe("too_many_images");
    expect(mocks.openPublicDownload).not.toHaveBeenCalled();
  });

  it("validates multiple images independently and reports each failure by position", async () => {
    mocks.openPublicDownload
      .mockResolvedValueOnce(serve(await realImage("jpeg", 2000, 2000)))
      .mockResolvedValueOnce(serve(await realImage("jpeg", 40, 40)));
    const error = await rejection(preflightImageInputs({ urls: ["https://a.example/1.jpg", "https://a.example/2.jpg"], limits: getImageInputLimits("tripo-v25-mv") }));
    expect(error.issues).toEqual([expect.objectContaining({ code: "dimensions_too_small", index: 1 })]);
  });

  it("checks base64 data URLs by encoded length before decoding", async () => {
    const small = `data:image/png;base64,${Buffer.from(await realImage("png", 256, 256)).toString("base64")}`;
    await expect(preflightImageInputs({ urls: [small], limits: getImageInputLimits("trellis-v1") })).resolves.toHaveLength(1);

    const limits = { ...getImageInputLimits("trellis-v1"), maxBytes: 1000 };
    const huge = `data:image/png;base64,${"A".repeat(4000)}`;
    const error = await rejection(preflightImageInputs({ urls: [huge], limits }));
    expect(error.issues[0].code).toBe("too_large");
    expect(mocks.openPublicDownload).not.toHaveBeenCalled();
  });

  it("reuses facts read earlier in the same request instead of downloading again", async () => {
    mocks.openPublicDownload.mockResolvedValue(serve(await realImage("png", 1024, 1024)));
    const cache: ImageFactsCache = new Map();

    await preflightImageInputs({ urls: [SIGNED_URL], limits: getImageInputLimits("wan-i2v"), cache });
    await preflightImageInputs({ urls: [SIGNED_URL], limits: getImageInputLimits("bria-product-shot"), cache });

    expect(mocks.openPublicDownload).toHaveBeenCalledTimes(1);
  });

  it("skips models whose input is not an image", async () => {
    await expect(preflightImageInputs({ urls: ["https://a.example/clip.mp4"], limits: getImageInputLimits("heygen-lipsync") })).resolves.toEqual([]);
    expect(mocks.openPublicDownload).not.toHaveBeenCalled();
  });
});
