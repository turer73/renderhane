import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * QR preset renderer + strict verifier round-trip tests.
 * Vendor QR engine + pure helpers run in Node with a stubbed window;
 * DOM/canvas raster paths (validateQrRaster) stay browser-only and are
 * covered by the demo's own browser matrix, not here.
 */

let QR: typeof import("../qr-artifact");

beforeAll(async () => {
  vi.stubGlobal("window", {});
  await import("../vendor/qr-core.js");
  QR = await import("../qr-artifact");
});

function rasterize(matrix: boolean[][], scale: number) {
  const n = matrix.length;
  const size = (n + 8) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!matrix[y][x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = (x + 4) * scale + dx;
          const py = (y + 4) * scale + dy;
          const i = (py * size + px) * 4;
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
        }
      }
    }
  }
  return { width: size, height: size, data };
}

describe("qr presets", () => {
  it("declares five styles with distinct shapes", () => {
    expect(QR.QR_PRESETS.map((p) => p.id)).toEqual([
      "square",
      "rounded",
      "dots",
      "diamond",
      "star",
    ]);
    const shapes = new Set(QR.QR_PRESETS.map((p) => QR.presetPath(p.id)));
    expect(shapes.size).toBe(5);
    expect(QR.isQrStyle("dots")).toBe(true);
    expect(QR.isQrStyle("triangle")).toBe(false);
  });

  it("validates options (style, size, bytes, contrast)", () => {
    expect(() =>
      QR.validateQrOptions("x", "#0b0f2d", 1024, "triangle")
    ).toThrow("Bilinmeyen QR şekli");
    expect(() =>
      QR.validateQrOptions("", "#0b0f2d", 1024, "square")
    ).toThrow();
    expect(() =>
      QR.validateQrOptions("x", "#ffffff", 1024, "square")
    ).toThrow(/koyu/);
    expect(() =>
      QR.validateQrOptions("x", "#0b0f2d", 128, "square")
    ).toThrow(/256/);
  });
});

describe("qr artifact + decode round-trip", () => {
  const styles = ["square", "rounded", "dots", "diamond", "star"] as const;

  for (const style of styles) {
    it(`round-trips Turkish payload through ${style} modules`, async () => {
      const payload = "Merhaba İstanbul https://ornek.com/çay-42";
      const artifact = await QR.buildQrArtifact(payload, "#0b0f2d", 1024, style);
      expect(artifact.modules).toBeGreaterThan(20);
      expect(artifact.svg).toContain(`data-qr-style="${style}"`);
      expect(artifact.svg).toContain('data-qr-ecc="H"');

      const pixels = rasterize(artifact.matrix, 6);
      const grid = QR.sampleAlignedPixels(pixels, artifact.modules);
      const decoded = await QR.decodeAlignedGrid(grid);

      expect(decoded.eci).toBe(26);
      expect(decoded.correctionLevel).toBe(2);
      expect(Buffer.from(decoded.bytes).toString("utf-8")).toBe(payload);
    });
  }

  it("rejects a single flipped data module (no correction attempted)", async () => {
    const artifact = await QR.buildQrArtifact("https://renderhane.com", "#0b0f2d", 1024, "square");
    const n = artifact.modules;
    // Find a dark DATA module (not functional) and flip it in the raster.
    let target: [number, number] | null = null;
    outer: for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (artifact.matrix[y][x] && !artifact.functional[y][x]) {
          target = [x, y];
          break outer;
        }
      }
    }
    expect(target).not.toBe(null);
    const pixels = rasterize(artifact.matrix, 6);
    const [tx, ty] = target!;
    const size = (n + 8) * 6;
    const cx = (tx + 4) * 6 + 3;
    const cy = (ty + 4) * 6 + 3;
    const i = (cy * size + cx) * 4;
    pixels.data[i] = 255;
    pixels.data[i + 1] = 255;
    pixels.data[i + 2] = 255;

    const grid = QR.sampleAlignedPixels(pixels, n);
    await expect(QR.decodeAlignedGrid(grid)).rejects.toThrow();
  });

  it("rejects a damaged quiet zone", async () => {
    const artifact = await QR.buildQrArtifact("https://renderhane.com", "#0b0f2d", 1024, "square");
    const pixels = rasterize(artifact.matrix, 6);
    pixels.data[0] = 0;
    pixels.data[1] = 0;
    pixels.data[2] = 0;
    expect(() => QR.sampleAlignedPixels(pixels, artifact.modules)).toThrow(/boş kenar/);
  });
});
