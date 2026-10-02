import { describe, expect, it, vi } from "vitest";

const sharpMock = vi.hoisted(() => {
  const failure = { error: new Error("timeout: 10% complete") };
  const chain = {
    timeout: () => chain,
    resize: () => chain,
    raw: () => chain,
    toBuffer: async () => { throw failure.error; },
  };
  return { failure, sharp: vi.fn(() => chain) };
});

vi.mock("server-only", () => ({}));
vi.mock("sharp", () => ({ default: sharpMock.sharp }));

import { verifyImageData } from "../image-decode-check";

describe("image data check limits", () => {
  it("decodes with error-level strictness, a pixel cap, one frame and a time limit", async () => {
    expect(await verifyImageData(new Uint8Array(32))).toBe("timeout");
    expect(sharpMock.sharp).toHaveBeenCalledWith(expect.any(Uint8Array), expect.objectContaining({
      failOn: "error",
      limitInputPixels: 50_000_000,
      pages: 1,
    }));
  });

  it("reports any other decoder error as a failed decode", async () => {
    sharpMock.failure.error = new Error("Input buffer has corrupt header");
    expect(await verifyImageData(new Uint8Array(32))).toBe("failed");
  });
});
