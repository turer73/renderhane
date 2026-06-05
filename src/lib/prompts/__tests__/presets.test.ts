import { describe, it, expect } from "vitest";
import { buildBackbone, SCENE_PRESETS, APLUS_PRESETS, type PromptContext } from "../presets";

describe("buildBackbone — scene", () => {
  it("non-edit (Bria): describes setting + lighting, no product-preservation clause", () => {
    const out = buildBackbone({ kind: "scene", sceneType: "studio" }, false);
    expect(out).toContain("seamless studio backdrop");
    expect(out).toContain("professional e-commerce product photography");
    expect(out).not.toContain("Place the product");
  });

  it("edit (Nano Banana Pro): places product + preserves identity", () => {
    const out = buildBackbone({ kind: "scene", sceneType: "luxury" }, true);
    expect(out).toContain("Place the product into");
    expect(out).toContain("marble");
    expect(out.toLowerCase()).toContain("preserve the product");
  });

  it("unknown scene key falls back to the default (studio)", () => {
    const out = buildBackbone({ kind: "scene", sceneType: "does-not-exist" }, false);
    expect(out).toContain(SCENE_PRESETS.studio.setting);
  });
});

describe("buildBackbone — aplus", () => {
  it("includes the template layout and platform constraint", () => {
    const out = buildBackbone({ kind: "aplus", template: "infographic", platform: "amazon" }, false);
    expect(out).toContain(APLUS_PRESETS.infographic.layout);
    expect(out).toContain("pure white background");
  });

  it("edit mode preserves product for A+", () => {
    const out = buildBackbone({ kind: "aplus", template: "feature", platform: "trendyol" }, true);
    expect(out).toContain("Place the product into");
    expect(out.toLowerCase()).toContain("preserve the product");
  });
});

describe("buildBackbone — image-edit", () => {
  it("returns the concise identity/quality guardrail", () => {
    const ctx: PromptContext = { kind: "image-edit", action: "recolor" };
    const out = buildBackbone(ctx, true);
    expect(out.toLowerCase()).toContain("keeping the rest of the image");
    expect(out.toLowerCase()).toContain("product identity");
  });
});
