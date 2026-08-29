import { describe, expect, it } from "vitest";
import {
  getAdSenseScriptUrl,
  isValidAdSenseClientId,
  isValidAdSenseSlotId,
} from "../adsense";

describe("AdSense identifiers", () => {
  it("accepts the official publisher and ad-slot formats", () => {
    expect(isValidAdSenseClientId("ca-pub-5103156785085864")).toBe(true);
    expect(isValidAdSenseSlotId("1573596806")).toBe(true);
  });

  it("rejects named placeholders and malformed publisher IDs", () => {
    expect(isValidAdSenseSlotId("tool-hero")).toBe(false);
    expect(isValidAdSenseSlotId("123")).toBe(false);
    expect(isValidAdSenseClientId("pub-5103156785085864")).toBe(false);
  });

  it("only creates a script URL for a valid publisher ID", () => {
    expect(getAdSenseScriptUrl("ca-pub-5103156785085864")).toBe(
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5103156785085864"
    );
    expect(getAdSenseScriptUrl("ca-pub-invalid")).toBeNull();
  });
});
