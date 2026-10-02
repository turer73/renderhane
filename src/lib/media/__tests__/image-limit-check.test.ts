import { describe, expect, it } from "vitest";
import { getImageInputLimits } from "../image-input-contract";
import {
  adviseImageFacts,
  checkImageCount,
  checkImageFacts,
  formatBytesTr,
  unreachableImageIssue,
  type ImageFacts,
} from "../image-limit-check";

function facts(overrides: Partial<ImageFacts["probe"]> & { bytes?: number } = {}): ImageFacts {
  const { bytes = 2_000_000, ...probe } = overrides;
  return { bytes, probe: { format: "jpeg", width: 2000, height: 1500, alpha: "no", animated: false, ...probe } };
}

describe("checkImageFacts", () => {
  const hunyuan = getImageInputLimits("hunyuan3d-v31-pro");

  it("accepts an image within every limit", () => {
    expect(checkImageFacts(facts(), hunyuan, null)).toEqual([]);
  });

  it("reports every broken limit with Turkish copy and the image position in a set", () => {
    const issues = checkImageFacts(
      facts({ format: "gif", width: 6000, height: 100, bytes: 9_500_000 }),
      hunyuan,
      { index: 1, count: 3 }
    );
    expect(issues.map((issue) => issue.code)).toEqual(["unsupported_format", "too_large", "dimensions_too_small", "dimensions_too_large"]);
    expect(issues.every((issue) => issue.index === 1 && issue.message.startsWith("2. görsel: "))).toBe(true);
    expect(issues[0].message).toContain("JPEG, PNG veya WebP");
    expect(issues[1].message).toContain("9,5 MB");
  });

  it("does not name the image when it is the only one", () => {
    const [issue] = checkImageFacts(facts({ format: "gif" }), hunyuan, { index: 0, count: 1 });
    expect(issue.index).toBe(0);
    expect(issue.message.startsWith("GIF")).toBe(true);
  });

  it("refuses decompression bombs by header pixel count", () => {
    const issues = checkImageFacts(facts({ width: 20_000, height: 20_000, bytes: 100_000 }), getImageInputLimits("trellis-v1"), null);
    expect(issues.map((issue) => issue.code)).toContain("too_many_pixels");
  });

  it("checks image counts against the model", () => {
    expect(checkImageCount(5, getImageInputLimits("tripo-v25-mv"))?.code).toBe("too_many_images");
    expect(checkImageCount(0, getImageInputLimits("wan-i2v"))?.code).toBe("too_few_images");
    expect(checkImageCount(2, getImageInputLimits("fashn-tryon"))).toBeNull();
  });

  it("never puts a URL in a message", () => {
    expect(unreachableImageIssue(null).message).not.toMatch(/https?:|token=/);
  });

  it("formats sizes in decimal megabytes like provider documentation", () => {
    expect(formatBytesTr(12_000_000)).toBe("12 MB");
    expect(formatBytesTr(5_242_880)).toBe("5,2 MB");
    expect(formatBytesTr(900)).toBe("1 KB");
  });

  it("turns documented guidance into non-blocking notes", () => {
    const veo = getImageInputLimits("veo31-i2v");
    expect(adviseImageFacts(facts({ width: 1280, height: 720 }), veo)).toEqual([]);
    expect(adviseImageFacts(facts({ width: 800, height: 800 }), veo)).toHaveLength(1);
    expect(adviseImageFacts(facts({ width: 640, height: 480 }), veo)).toHaveLength(2);
  });
});
