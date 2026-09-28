import { describe, expect, it } from "vitest";
import { buildVCard, parseVCard } from "../vcard";

describe("buildVCard", () => {
  it("uses vCard 3.0 name components and CRLF separators", () => {
    const card = buildVCard({ firstName: "Turgut", lastName: "Ürer", phone: "+905551234567" });
    expect(card).toContain("N:Ürer;Turgut;;;");
    expect(card).toContain("FN:Turgut Ürer");
    expect(card).toContain("\r\n");
    expect(card.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("prevents query fields from injecting new vCard properties", () => {
    const card = buildVCard({ firstName: "Turgut\r\nURL:https://evil.example" });
    expect(card).not.toContain("\r\nURL:https://evil.example");
    expect(card).toContain("Turgut\\nURL:https://evil.example");
  });

  it("round-trips escaped names, organizations, addresses, and newlines", () => {
    const original = {
      firstName: "Tur;gut",
      lastName: "Urer, Jr.",
      org: "Acme, Inc.",
      address: "Hasan; Celebi, Sokak",
      title: "Kurucu\nTasarimci",
    };
    expect(parseVCard(buildVCard(original))).toMatchObject(original);
  });

  it("recognizes grouped email, phone, and labeled social URLs", () => {
    const grouped = [
      "BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "item1.EMAIL;TYPE=INTERNET:ada@example.com",
      "item2.TEL;TYPE=CELL:+905551234567",
      "item3.URL:https://www.instagram.com/renderhane",
      "END:VCARD",
    ].join("\r\n");
    expect(parseVCard(grouped)).toMatchObject({
      email: "ada@example.com", phone: "+905551234567", instagram: "renderhane",
    });
  });

  it("unfolds standards-compliant continuation lines before parsing", () => {
    const folded = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Ada Lovelace",
      "ORG:Render",
      " hane",
      "URL:https://example.com/a/very/long/",
      " path",
      "END:VCARD",
    ].join("\r\n");
    expect(parseVCard(folded)).toMatchObject({
      firstName: "Ada", lastName: "Lovelace", org: "Renderhane",
      website: "https://example.com/a/very/long/path",
    });
  });

  it("preserves URI punctuation in website values", () => {
    const website = "https://example.com/a,b;c#/contact";
    const card = buildVCard({ firstName: "Ada", website });
    expect(card).toContain(`URL:${website}`);
    expect(parseVCard(card).website).toBe(website);
  });
});
