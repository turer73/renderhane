import { describe, expect, it } from "vitest";
import {
  buildBusinessLandingUrl,
  businessEntries,
  businessFormFields,
  businessFromLandingUrl,
  businessFromText,
  formatBusinessText,
  formatIbanForDisplay,
  parseBusinessLandingHash,
  type BusinessDetails,
} from "../business-card";
import { ndefMessageBytes } from "../ndef";

const bank: BusinessDetails = {
  kind: "bank",
  locale: "tr",
  fields: ["Turgut Ürer", "TR330006100519786457841326", "Ziraat", "", ""],
};

const invoice: BusinessDetails = {
  kind: "invoice",
  locale: "en",
  fields: ["Renderhane Ltd.", "Avcılar", "1234567890", "Merkez Mah. 1 Sok. No:2 İstanbul", "fatura@renderhane.com"],
};

describe("bank / invoice landing links", () => {
  it("keeps the details in the fragment so the server never receives them", () => {
    const url = new URL(buildBusinessLandingUrl(bank));
    expect(url.origin + url.pathname).toBe("https://www.renderhane.com/tr/b");
    expect(url.search).toBe("");
    expect(url.hash).toContain("i=TR330006100519786457841326");
    expect(url.hash).not.toContain("t=");
  });

  it("round-trips bank and invoice details through the link", () => {
    expect(businessFromLandingUrl(buildBusinessLandingUrl(bank))).toEqual(bank);
    expect(businessFromLandingUrl(buildBusinessLandingUrl(invoice))).toEqual(invoice);
    expect(buildBusinessLandingUrl(invoice)).toContain("/en/b#t=f&");
  });

  it("fits a typical bank card on an NTAG213", () => {
    expect(ndefMessageBytes([{ recordType: "url", data: buildBusinessLandingUrl(bank) }])).toBeLessThanOrEqual(132);
  });

  it("rejects foreign, insecure or incomplete links", () => {
    const hash = buildBusinessLandingUrl(bank).split("#")[1];
    expect(businessFromLandingUrl(`https://evil.example/tr/b#${hash}`)).toBeNull();
    expect(businessFromLandingUrl(`http://www.renderhane.com/tr/b#${hash}`)).toBeNull();
    expect(businessFromLandingUrl(`https://www.renderhane.com/tr/k#${hash}`)).toBeNull();
    expect(businessFromLandingUrl("https://www.renderhane.com/tr/b#n=Ad")).toBeNull();
    expect(parseBusinessLandingHash("#i=TR33", "tr")).toBeNull();
  });

  it("strips control characters from tag-supplied values", () => {
    const parsed = parseBusinessLandingHash("#n=A%0Ab&i=TR33%00X", "tr");
    expect(parsed?.fields.slice(0, 2)).toEqual(["A b", "TR33 X"]);
  });
});

describe("bank / invoice text", () => {
  it("parses its own text output in either locale", () => {
    expect(formatBusinessText(bank)).toBe("BANKA BİLGİLERİ\nAlıcı: Turgut Ürer\nIBAN: TR330006100519786457841326\nBanka: Ziraat");
    expect(businessFromText(formatBusinessText(bank))).toEqual(bank);
    expect(businessFromText(formatBusinessText(invoice))).toEqual(invoice);
    expect(businessFromText("Merhaba\nIBAN: TR33")).toBeNull();
  });

  it("offers labelled rows and editor fields without empty values", () => {
    expect(businessEntries(bank)).toEqual([
      { key: "accountName", label: "Alıcı", value: "Turgut Ürer" },
      { key: "iban", label: "IBAN", value: "TR330006100519786457841326" },
      { key: "bankName", label: "Banka", value: "Ziraat" },
    ]);
    expect(businessEntries(bank, "en")[0].label).toBe("Recipient");
    expect(businessFormFields(bank)).toEqual({ accountName: "Turgut Ürer", iban: "TR330006100519786457841326", bankName: "Ziraat" });
  });

  it("groups an IBAN in fours for reading", () => {
    expect(formatIbanForDisplay("TR330006100519786457841326")).toBe("TR33 0006 1005 1978 6457 8413 26");
  });
});
