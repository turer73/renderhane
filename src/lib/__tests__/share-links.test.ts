import { describe, expect, it } from "vitest";
import {
  buildContactLandingUrl,
  buildSocialLandingUrl,
  buildSocialPayload,
  normalizeSocialLink,
  isPrivateSharePath,
  socialLinksFromParams,
} from "../share-links";

describe("social link normalization", () => {
  it("creates canonical links from handles and phone numbers", () => {
    expect(normalizeSocialLink("instagram", "@renderhane").url).toBe(
      "https://www.instagram.com/renderhane"
    );
    expect(normalizeSocialLink("whatsapp", "+90 555 123 45 67").url).toBe(
      "https://wa.me/905551234567"
    );
    expect(normalizeSocialLink("tiktok", "@renderhane").url).toBe(
      "https://www.tiktok.com/@renderhane"
    );
  });

  it("accepts official full URLs and rejects look-alike hosts", () => {
    expect(normalizeSocialLink("x", "https://twitter.com/renderhane?ref=test").url).toBe(
      "https://x.com/renderhane"
    );
    expect(() =>
      normalizeSocialLink("instagram", "https://instagram.com.example.org/renderhane")
    ).toThrow(/resmi bağlantı/);
  });

  it("preserves official URLs that cannot be converted to a profile losslessly", () => {
    expect(normalizeSocialLink("youtube", "https://youtube.com/channel/UC123").url).toBe(
      "https://youtube.com/channel/UC123"
    );
    expect(normalizeSocialLink("youtube", "https://youtu.be/abc123").url).toBe(
      "https://youtu.be/abc123"
    );
    expect(normalizeSocialLink("facebook", "https://facebook.com/profile.php?id=123").url).toBe(
      "https://facebook.com/profile.php?id=123"
    );
  });

  it("marks contact and social share routes as analytics-free", () => {
    expect(isPrivateSharePath("/tr/k")).toBe(true);
    expect(isPrivateSharePath("/en/s/")).toBe(true);
    expect(isPrivateSharePath("/tr/araclar/nfc-yaz")).toBe(false);
  });
});

describe("share landing URLs", () => {
  it("uses a direct official URL for one network", () => {
    expect(
      buildSocialPayload({ socialMode: "single", platform: "telegram", socialValue: "@renderhane" })
    ).toBe("https://t.me/renderhane");
  });

  it("creates and safely decodes a stateless multi-network card", () => {
    const url = buildSocialLandingUrl(
      { profileName: "Renderhane", instagram: "@renderhane", whatsapp: "+905551234567" },
      "tr"
    );
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/tr/s");
    expect(parsed.searchParams.get("n")).toBe("Renderhane");
    expect(socialLinksFromParams(parsed.searchParams).map((link) => link.url)).toEqual([
      "https://www.instagram.com/renderhane",
      "https://wa.me/905551234567",
    ]);
  });

  it("requires at least two links for a multi-network card", () => {
    expect(() => buildSocialLandingUrl({ instagram: "renderhane" })).toThrow(/en az iki/);
  });

  it("creates an iPhone and Android contact landing URL without storing data", () => {
    const url = new URL(
      buildContactLandingUrl(
        { firstName: "Turgut", lastName: "Ürer", phone: "+90 555 123 45 67" },
        "tr"
      )
    );
    expect(url.pathname).toBe("/tr/k");
    expect(url.searchParams.get("n")).toBe("Turgut");
    expect(url.searchParams.get("s")).toBe("Ürer");
    expect(url.searchParams.get("p")).toBe("+905551234567");
  });
});
