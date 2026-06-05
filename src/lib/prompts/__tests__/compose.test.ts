import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { composeSmartPrompt } from "../compose";

/**
 * These tests exercise the DETERMINISTIC fallback path (no FAL_KEY), so no real
 * LLM call is made. The fallback must always produce a usable prompt — this is
 * the guarantee that the smart layer never blocks a generation.
 */
describe("composeSmartPrompt — deterministic fallback (no FAL_KEY)", () => {
  let savedKey: string | undefined;
  beforeEach(() => {
    savedKey = process.env.FAL_KEY;
    delete process.env.FAL_KEY;
  });
  afterEach(() => {
    if (savedKey !== undefined) process.env.FAL_KEY = savedKey;
  });

  it("scene (Bria default): backbone + caption + notes", async () => {
    const out = await composeSmartPrompt({
      tool: "scene",
      modelKey: undefined,
      ctx: { kind: "scene", sceneType: "luxury", caption: "a glass perfume bottle" },
      userText: "soft golden reflection",
    });
    expect(out).toContain("marble"); // luxury backbone
    expect(out).toContain("Product: a glass perfume bottle.");
    expect(out).toContain("soft golden reflection");
    expect(out).not.toContain("Place the product"); // Bria = non-edit framing
  });

  it("scene (Nano Banana Pro): edit framing preserves product", async () => {
    const out = await composeSmartPrompt({
      tool: "scene",
      modelKey: "nano-banana-pro-edit",
      ctx: { kind: "scene", sceneType: "studio", caption: "a sneaker" },
      userText: "",
    });
    expect(out).toContain("Place the product into");
    expect(out).toContain("Product: a sneaker.");
  });

  it("works with caption only (no user notes) — site builds prompt unaided", async () => {
    const out = await composeSmartPrompt({
      tool: "aplus",
      modelKey: undefined,
      ctx: { kind: "aplus", template: "feature", platform: "amazon", caption: "a steel thermos" },
    });
    expect(out).toContain("pure white background");
    expect(out).toContain("Product: a steel thermos.");
    expect(out.length).toBeGreaterThan(20);
  });

  it("never returns empty even with no caption and no notes", async () => {
    const out = await composeSmartPrompt({
      tool: "scene",
      ctx: { kind: "scene", sceneType: "minimal" },
    });
    expect(out.trim().length).toBeGreaterThan(0);
  });
});
