import { describe, it, expect } from "vitest";
import {
  detectProductType, smartDefaultsFor, primaryToolTarget, SMART_DEFAULTS,
} from "../product-intel";

describe("detectProductType", () => {
  it("classifies common categories from caption/tags", () => {
    expect(detectProductType("a gold diamond ring on a table", [])).toBe("jewelry");
    expect(detectProductType("a glass perfume bottle", ["fragrance"])).toBe("cosmetics");
    expect(detectProductType("a pair of running sneakers", [])).toBe("footwear");
    expect(detectProductType("a red cotton t-shirt", ["clothing"])).toBe("apparel");
    expect(detectProductType("a wireless headphone", ["gadget"])).toBe("electronics");
  });

  it("falls back to generic for unknown products", () => {
    expect(detectProductType("an abstract metal object", ["thing"])).toBe("generic");
  });

  it("is case-insensitive and uses tags too", () => {
    expect(detectProductType("Close-up SHOT", ["Necklace"])).toBe("jewelry");
  });
});

describe("smartDefaultsFor", () => {
  it("maps category to a scene preset + label", () => {
    const d = smartDefaultsFor("a luxury handbag", []);
    expect(d.category).toBe("bag");
    expect(d.sceneType).toBe("luxury");
    expect(d.label).toBe("Çanta");
  });

  it("every category has a defined scene default", () => {
    for (const key of Object.keys(SMART_DEFAULTS)) {
      expect(SMART_DEFAULTS[key as keyof typeof SMART_DEFAULTS].sceneType).toBeTruthy();
    }
  });
});

describe("primaryToolTarget", () => {
  it("returns the first known tool target", () => {
    expect(primaryToolTarget(["virtual-tryon"])?.tab).toBe("virtual-tryon");
    expect(primaryToolTarget(["bg-remove", "scene"])?.group).toBe("image");
  });

  it("returns null when no suggested tool maps", () => {
    expect(primaryToolTarget([])).toBeNull();
    expect(primaryToolTarget(["unknown-tool"])).toBeNull();
  });
});
