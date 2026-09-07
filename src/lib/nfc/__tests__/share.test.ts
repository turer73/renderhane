import { describe, it, expect } from "vitest";
import { buildShareUrl, decodeNfcState, encodeNfcState, readShareHash } from "../share";

describe("encodeNfcState / decodeNfcState", () => {
  it("round-trips content type and fields", () => {
    const state = { type: "wifi" as const, fields: { ssid: "Ofis WiFi", password: "şifre-123" } };
    const decoded = decodeNfcState(encodeNfcState(state));
    expect(decoded).toEqual(state);
  });

  it("survives non-ASCII and URL-unsafe characters", () => {
    const state = { type: "text" as const, fields: { text: "Güneş / ışık + gölge ?&=#" } };
    const token = encodeNfcState(state);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeNfcState(token)?.fields.text).toBe("Güneş / ışık + gölge ?&=#");
  });

  it("drops empty fields so links stay short", () => {
    const token = encodeNfcState({ type: "url", fields: { url: "renderhane.com", note: "  " } });
    expect(decodeNfcState(token)?.fields).toEqual({ url: "renderhane.com" });
  });

  it("rejects junk, wrong versions and unknown content types", () => {
    expect(decodeNfcState("")).toBeNull();
    expect(decodeNfcState("not-base64!!")).toBeNull();
    expect(decodeNfcState(btoa(JSON.stringify({ v: 99, t: "url", f: {} })))).toBeNull();
    expect(decodeNfcState(btoa(JSON.stringify({ v: 1, t: "malware", f: {} })))).toBeNull();
    expect(decodeNfcState(btoa(JSON.stringify({ v: 1, t: "url", f: ["x"] })))).toBeNull();
  });

  it("ignores non-string field values instead of trusting them", () => {
    const token = btoa(JSON.stringify({ v: 1, t: "url", f: { url: "a.com", evil: { x: 1 } } }));
    expect(decodeNfcState(token)?.fields).toEqual({ url: "a.com" });
  });

  it("refuses oversized tokens", () => {
    expect(decodeNfcState("A".repeat(4000))).toBeNull();
  });
});

describe("share links", () => {
  it("keeps the payload in the fragment, never the query string", () => {
    const url = buildShareUrl("https://www.renderhane.com", "/tr/araclar/nfc-yaz", {
      type: "wifi",
      fields: { ssid: "Ofis", password: "gizli" },
    });
    expect(url).toContain("#d=");
    expect(url.split("#")[0]).toBe("https://www.renderhane.com/tr/araclar/nfc-yaz");
    expect(url.split("#")[0]).not.toContain("gizli");
  });

  it("reads state back out of a location hash", () => {
    const url = buildShareUrl("https://x.test", "/tr/araclar/nfc-yaz", {
      type: "phone",
      fields: { phone: "+905551234567" },
    });
    const hash = url.slice(url.indexOf("#"));
    expect(readShareHash(hash)).toEqual({ type: "phone", fields: { phone: "+905551234567" } });
    expect(readShareHash(hash.slice(1))).toEqual({
      type: "phone",
      fields: { phone: "+905551234567" },
    });
  });

  it("returns null for an empty or unrelated hash", () => {
    expect(readShareHash("")).toBeNull();
    expect(readShareHash("#section-2")).toBeNull();
  });
});
