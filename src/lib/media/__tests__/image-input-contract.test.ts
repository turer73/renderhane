import { describe, expect, it } from "vitest";
import { MODELS, TOOL_MODELS } from "@/lib/fal/models";
import {
  getImageInputLimits,
  getSelectionImageInputLimits,
  IMAGE_DOWNLOAD_HARD_LIMIT_BYTES,
  intersectImageInputLimits,
  UNVERIFIED_FORMATS,
  UNVERIFIED_MAX_BYTES,
} from "../image-input-contract";
import { checkImageFacts, unverifiedLimitsNoteTr, type ImageFacts } from "../image-limit-check";

function facts(bytes: number, width = 1024, height = 1024, format: ImageFacts["probe"]["format"] = "png"): ImageFacts {
  return { bytes, probe: { format, width, height, alpha: "no", animated: false } };
}

describe("image input contract", () => {
  it("defines limits for every model and never imposes 5 MiB on all of them", () => {
    for (const key of Object.keys(MODELS)) {
      const limits = getImageInputLimits(key);
      expect(limits.maxBytes).toBeGreaterThan(5 * 1024 * 1024);
      expect(limits.maxBytes).toBeLessThanOrEqual(IMAGE_DOWNLOAD_HARD_LIMIT_BYTES);
    }
  });

  it("uses each provider's documented limits where they exist", () => {
    expect(getImageInputLimits("hunyuan3d-v31-pro")).toMatchObject({
      maxBytes: 8_000_000,
      minDimension: 128,
      maxDimension: 5000,
      formats: ["jpeg", "png", "webp"],
      verification: { formats: true, size: true, dimensions: true },
    });
    expect(getImageInputLimits("recraft-crisp-upscale").formats).toEqual(["png"]);
    expect(getImageInputLimits("meshy-v71").formats).not.toContain("webp");
    expect(getImageInputLimits("seedance-2-i2v").maxBytes).toBe(30_000_000);
  });

  it("marks undocumented limits as unverified instead of presenting them as provider facts", () => {
    const limits = getImageInputLimits("trellis-v1");
    expect(limits).toMatchObject({
      maxBytes: UNVERIFIED_MAX_BYTES,
      formats: [...UNVERIFIED_FORMATS],
      verification: { formats: false, size: false, source: null },
    });
    expect(unverifiedLimitsNoteTr(limits)).toContain("belgelemiyor");
    expect(unverifiedLimitsNoteTr(getImageInputLimits("bria-product-shot"))).toBeNull();
  });

  it("derives image counts from the request schema and the entry-point cap", () => {
    expect(getImageInputLimits("tripo-v25-mv")).toMatchObject({ minImages: 1, maxImages: 4 });
    expect(getImageInputLimits("hyper3d-rodin").maxImages).toBe(4);
    expect(getImageInputLimits("fashn-tryon").maxImages).toBe(2);
    expect(getImageInputLimits("wan-i2v").maxImages).toBe(1);
    expect(getImageInputLimits("flux-pro")).toMatchObject({ inputKind: "none", maxImages: 0 });
  });

  it("does not treat a video input as an image", () => {
    expect(getImageInputLimits("heygen-lipsync").inputKind).toBe("video");
  });

  it("intersects limits when one image feeds several models", () => {
    const socialKit = intersectImageInputLimits([getImageInputLimits("bria-product-shot"), getImageInputLimits("wan-i2v")]);
    expect(socialKit).toMatchObject({ maxBytes: 12_000_000, formats: ["jpeg", "png", "webp"], modelKeys: ["bria-product-shot", "wan-i2v"] });
    const enhance = intersectImageInputLimits(TOOL_MODELS.enhance.map(getImageInputLimits));
    expect(enhance.formats).toEqual(["png"]);
  });

  it("mirrors tier routing in the browser and falls back to the strictest model set", () => {
    expect(getSelectionImageInputLimits({ tool: "3d-model", modelKey: "meshy-v71" }).modelKeys).toEqual(["meshy-v71"]);
    const routed = getSelectionImageInputLimits({ tool: "3d-model", tier: "premium" });
    expect(routed.modelKeys).toHaveLength(1);
    expect(TOOL_MODELS["3d-model"]).toContain(routed.modelKeys[0]);
  });

  it("checks the 5,242,880-byte boundary exactly and only where a model sets it", () => {
    const fiveMiB = { ...getImageInputLimits("trellis-v1"), maxBytes: 5_242_880 };
    expect(checkImageFacts(facts(5_242_880), fiveMiB, null)).toEqual([]);
    expect(checkImageFacts(facts(5_242_881), fiveMiB, null).map((issue) => issue.code)).toEqual(["too_large"]);
    expect(checkImageFacts(facts(5_242_881), getImageInputLimits("trellis-v1"), null)).toEqual([]);
  });
});
