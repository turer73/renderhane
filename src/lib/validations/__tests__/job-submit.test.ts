import { describe, expect, it } from "vitest";
import { validateJobSubmit } from "../job-submit";

describe("validateJobSubmit", () => {
  it("accepts the bounded logo parameter contract", () => {
    const result = validateJobSubmit({
      tool: "logo",
      prompt: "Renderhane logo",
      extraParams: {
        outputFormat: "svg",
        style: "digital_illustration",
        colors: [{ rgb: { r: 79, g: 70, b: 229 } }],
      },
    });

    expect(result.valid).toBe(true);
  });

  it("rejects cost-affecting fal.ai parameters", () => {
    const result = validateJobSubmit({
      tool: "video",
      imageUrl: "https://assets.renderhane.com/input.png",
      extraParams: {
        duration: "30",
        generate_audio: true,
        resolution: "4K",
      },
    });

    expect(result.valid).toBe(false);
  });

  it("rejects logo parameters outside the allowlist", () => {
    const result = validateJobSubmit({
      tool: "logo",
      prompt: "Renderhane logo",
      extraParams: { num_images: 20 },
    });

    expect(result.valid).toBe(false);
  });

  it("rejects more than three colors and invalid RGB channels", () => {
    const tooMany = validateJobSubmit({
      tool: "logo",
      prompt: "Renderhane logo",
      extraParams: {
        colors: Array.from({ length: 4 }, () => ({ rgb: { r: 1, g: 2, b: 3 } })),
      },
    });
    const invalidChannel = validateJobSubmit({
      tool: "logo",
      prompt: "Renderhane logo",
      extraParams: { colors: [{ rgb: { r: 256, g: 2, b: 3 } }] },
    });

    expect(tooMany.valid).toBe(false);
    expect(invalidChannel.valid).toBe(false);
  });
});
