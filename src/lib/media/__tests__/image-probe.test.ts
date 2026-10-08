import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { probeImage } from "../image-probe";
import { bmp, gif, isoImage, jpeg, png, textBytes, webpExtended, webpLossless, webpLossy } from "./image-fixtures";

describe("probeImage", () => {
  it("reads PNG dimensions and alpha from the header without decoding", () => {
    expect(probeImage(png({ width: 6000, height: 4000, colorType: 6 }))).toEqual({
      ok: true,
      image: { format: "png", width: 6000, height: 4000, alpha: "yes", animated: false },
    });
    expect(probeImage(png({ width: 800, height: 600, colorType: 2 }))).toMatchObject({ ok: true, image: { alpha: "no" } });
  });

  it("treats a tRNS chunk as transparency and acTL as animation", () => {
    expect(probeImage(png({ width: 10, height: 10, colorType: 2, transparencyChunk: true }))).toMatchObject({ image: { alpha: "yes" } });
    expect(probeImage(png({ width: 10, height: 10, animated: true }))).toMatchObject({ image: { animated: true } });
  });

  it("rejects a PNG that ends before its image data", () => {
    expect(probeImage(png({ width: 10, height: 10, imageData: false }))).toEqual({ ok: false, reason: "corrupt" });
  });

  it("finds the JPEG frame header after large metadata segments", () => {
    expect(probeImage(jpeg({ width: 4032, height: 3024, exifBytes: 60_000 }))).toEqual({
      ok: true,
      image: { format: "jpeg", width: 4032, height: 3024, alpha: "no", animated: false },
    });
    expect(probeImage(jpeg({ width: 1200, height: 900, frameMarker: 0xc2 }))).toMatchObject({ image: { width: 1200, height: 900 } });
  });

  it("rejects a JPEG whose scan starts before any frame header", () => {
    const broken = jpeg({ width: 10, height: 10, frameMarker: 0xc4 });
    expect(probeImage(broken)).toEqual({ ok: false, reason: "corrupt" });
  });

  it("reads all three WebP variants, including the alpha and animation flags", () => {
    expect(probeImage(webpLossy({ width: 1920, height: 1080 }))).toMatchObject({ image: { format: "webp", width: 1920, height: 1080, alpha: "no" } });
    expect(probeImage(webpLossless({ width: 512, height: 256, alpha: true }))).toMatchObject({ image: { width: 512, height: 256, alpha: "yes" } });
    expect(probeImage(webpExtended({ width: 3000, height: 2000, alpha: true, animated: true }))).toMatchObject({
      image: { width: 3000, height: 2000, alpha: "yes", animated: true },
    });
  });

  it("identifies GIF, BMP, AVIF and HEIC containers", () => {
    expect(probeImage(gif({ width: 320, height: 240 }))).toMatchObject({ image: { format: "gif", alpha: "maybe" } });
    expect(probeImage(bmp({ width: 640, height: 480 }))).toMatchObject({ image: { format: "bmp", width: 640, height: 480 } });
    expect(probeImage(isoImage({ brand: "avif", extents: [[256, 256], [4000, 3000]] }))).toMatchObject({
      image: { format: "avif", width: 4000, height: 3000 },
    });
    expect(probeImage(isoImage({ brand: "heic", extents: [[512, 512], [4032, 3024]] }))).toMatchObject({
      image: { format: "heic", width: 4032, height: 3024 },
    });
  });

  it("uses the bytes, not the declared type: a PDF or text named .png is not an image", () => {
    expect(probeImage(textBytes("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj"))).toEqual({ ok: false, reason: "unsupported" });
    expect(probeImage(textBytes("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toEqual({ ok: false, reason: "unsupported" });
    expect(probeImage(new Uint8Array())).toEqual({ ok: false, reason: "corrupt" });
  });

  it("rejects zero dimensions as corrupt", () => {
    expect(probeImage(png({ width: 0, height: 100 }))).toEqual({ ok: false, reason: "corrupt" });
  });

  it("reads the repository's real PNG fixture", () => {
    const bytes = new Uint8Array(readFileSync("e2e/fixtures/test-image.png"));
    const probe = probeImage(bytes);
    expect(probe.ok).toBe(true);
    if (probe.ok) expect(probe.image.format).toBe("png");
  });
});
