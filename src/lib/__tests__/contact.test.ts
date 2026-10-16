import { describe, expect, it } from "vitest";
import { CONTACT_EMAIL } from "../contact";
import tr from "@/messages/tr.json";
import en from "@/messages/en.json";

describe("public contact email", () => {
  it("uses the requested public address", () => {
    expect(CONTACT_EMAIL).toBe("render@renderhane.com");
  });

  describe.each([
    ["tr", tr],
    ["en", en],
  ] as const)("%s messages", (_locale, messages) => {
    it("keeps the translated footer address aligned", () => {
      expect(messages.landing.footer.email).toBe(CONTACT_EMAIL);
    });

    it.each(["privacy", "terms", "kvkk", "cookiePolicy"] as const)(
      "uses only the public contact address in %s",
      (policy) => {
        const addresses = Object.values(messages.legal[policy]).flatMap(
          (text) => text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []
        );
        expect(new Set(addresses)).toEqual(new Set([CONTACT_EMAIL]));
      }
    );
  });
});
