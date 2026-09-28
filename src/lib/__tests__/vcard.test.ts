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

  it("does not join an unencoded value that legitimately ends with equals", () => {
    const card = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "URL:https://example.com/?token=", "EMAIL:ada@example.com", "END:VCARD"].join("\r\n");
    expect(parseVCard(card)).toMatchObject({
      website: "https://example.com/?token=", email: "ada@example.com",
    });
  });

  it("preserves complete Instagram destinations when restoring", () => {
    const card = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "item1.URL:https://www.instagram.com/p/example", "END:VCARD"].join("\r\n");
    expect(parseVCard(card).instagram).toBe("https://www.instagram.com/p/example");
  });

  it("decodes quoted-printable UTF-8 values and soft line breaks", () => {
    const card = ["BEGIN:VCARD", "VERSION:3.0",
      "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=C3=9Crer;Tur=",
      "gut;;;",
      "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Turgut =C3=9Crer",
      "END:VCARD"].join("\r\n");
    expect(parseVCard(card)).toMatchObject({firstName: "Turgut", lastName: "Ürer"});
  });

  it("normalizes URI-valued telephone properties for editing", () => {
    const card = ["BEGIN:VCARD", "VERSION:4.0", "FN:Ada Lovelace",
      "TEL;VALUE=uri:tel:+905551234567", "END:VCARD"].join("\r\n");
    expect(parseVCard(card).phone).toBe("+905551234567");
  });

  it("preserves every populated structured address component", () => {
    const card = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "ADR:;;123 Main St;London;;SW1;UK", "END:VCARD"].join("\r\n");
    expect(parseVCard(card).address).toBe("123 Main St, London, SW1, UK");
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
      email: "ada@example.com", phone: "+905551234567", instagram: "https://www.instagram.com/renderhane",
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

  it("declines to edit cards with additional phone or email values", () => {
    const phones = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "TEL:+905551111111", "TEL:+905552222222", "END:VCARD"].join("\r\n");
    const emails = ["BEGIN:VCARD", "VERSION:3.0", "FN:Ada Lovelace",
      "EMAIL:ada@example.com", "EMAIL:work@example.com", "END:VCARD"].join("\r\n");
    expect(() => parseVCard(phones)).toThrow(/Birden fazla telefon/);
    expect(() => parseVCard(emails)).toThrow(/Birden fazla e-posta/);
  });

  it("folds generated content lines at 75 UTF-8 octets without changing values", () => {
    const original = {
      firstName: "Ü".repeat(40),
      lastName: "Ç".repeat(40),
      org: "Renderhane ".repeat(12).trim(),
    };
    const card = buildVCard(original);
    const encoder = new TextEncoder();
    expect(card.split("\r\n").every((line) => encoder.encode(line).length <= 75)).toBe(true);
    expect(parseVCard(card)).toMatchObject(original);
  });

  it("preserves URI punctuation in website values", () => {
    const website = "https://example.com/a,b;c#/contact";
    const card = buildVCard({ firstName: "Ada", website });
    expect(card).toContain(`URL:${website}`);
    expect(parseVCard(card).website).toBe(website);
  });
});
