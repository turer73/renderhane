import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { bmpPixelsPresent, heicStructureOk, verifyImageData } from "../image-decode-check";
import { bmp, isoImage } from "./image-fixtures";
import { bmpWithPixels, heicContainer, realImage, truncated } from "./real-images";

describe("image data check", () => {
  it("rejects a HEIC container with arbitrary bytes instead of coded pixels", async () => {
    expect(await verifyImageData(heicContainer(64, 64))).toBe("failed");
  });
  it("rejects a BMP whose pixel offset points into its header", async () => {
    const bytes = bmpWithPixels(64, 64);
    bytes.set([26, 0, 0, 0], 10);
    expect(await verifyImageData(bytes)).toBe("failed");
  });
  it("decodes real images and rejects ones that stop early", async () => {
    expect(await verifyImageData(await realImage("jpeg", 200, 100))).toBe("decoded");
    expect(await verifyImageData(truncated(await realImage("jpeg", 640, 480)))).toBe("failed");
  });

  it("requires every pixel row of an uncompressed BMP", () => {
    expect(bmpPixelsPresent(bmpWithPixels(301, 7))).toBe(true);
    expect(bmpPixelsPresent(bmp({ width: 301, height: 7 }))).toBe(false);
    const full = bmpWithPixels(16, 16);
    expect(bmpPixelsPresent(full.slice(0, full.length - 1))).toBe(false);
    const rle = bmpWithPixels(16, 16);
    rle[30] = 1; // BI_RLE8
    expect(bmpPixelsPresent(rle)).toBe(false);
    const topDown = bmpWithPixels(16, 16);
    topDown.set([0xf0, 0xff, 0xff, 0xff], 22); // height -16
    expect(bmpPixelsPresent(topDown)).toBe(true);
  });

  it("requires complete HEIC boxes with coded data", () => {
    expect(heicStructureOk(heicContainer(64, 64))).toBe(true);
    expect(heicStructureOk(isoImage({ brand: "heic", extents: [[64, 64]] }))).toBe(false);
    const cut = heicContainer(64, 64);
    expect(heicStructureOk(cut.slice(0, cut.length - 10))).toBe(false);
    const noFtyp = heicContainer(64, 64);
    noFtyp.set([0x66, 0x72, 0x65, 0x65], 4); // "free" instead of "ftyp"
    expect(heicStructureOk(noFtyp)).toBe(false);
    const toEnd = heicContainer(64, 64);
    toEnd.set([0, 0, 0, 0], 52); // mdat size 0 = to end of file
    expect(heicStructureOk(toEnd)).toBe(true);
  });
});
