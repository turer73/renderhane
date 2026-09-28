import { describe, expect, it } from "vitest";
import { buildVCard } from "../vcard";

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
});
