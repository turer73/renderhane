import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";
import { labResponseErrorKey, labRunErrorKey } from "../model-lab-errors";

describe("model lab localized response errors", () => {
  it.each([
    [401, "accessDenied"], [403, "accessDenied"], [429, "rateLimited"],
    [413, "tooLarge"], [400, "invalidRequest"], [422, "invalidRequest"],
    [404, "runNotFound"], [409, "runConflict"], [503, "configurationMissing"],
  ] as const)("maps HTTP %i without displaying server-language text", (status, key) => {
    expect(labResponseErrorKey(status, "submit")).toBe(key);
    expect(labResponseErrorKey(status, "status")).toBe(key);
    for (const messages of [en, tr]) expect(messages.modelLab[key].length).toBeGreaterThan(0);
  });

  it.each([500, 502, 504, 520])("keeps HTTP %i submissions uncertain but polling resumable", (status) => {
    expect(labResponseErrorKey(status, "submit")).toBe("uncertain");
    expect(labResponseErrorKey(status, "status")).toBe("statusReadError");
  });

  it("renders rate-limit and transient errors in English rather than the server language", () => {
    const t = createTranslator({ locale: "en", messages: en, namespace: "modelLab" });
    expect(t(labResponseErrorKey(429, "status"))).toContain("Too many requests");
    expect(t(labResponseErrorKey(502, "status"))).toBe("Status could not be read.");
    expect(t("providerFailed")).toContain("Check provider history");
  });

  it.each(["submission_uncertain", "submission_unacknowledged", "receipt_invalid", "provider_failed", "manually_resolved"])(
    "shows run error %s in the viewer's language, never the stored server text",
    (code) => {
      const key = labRunErrorKey(code)!;
      expect(key).toBe(`runErrors.${code}`);
      const english = createTranslator({ locale: "en", messages: en, namespace: "modelLab" })(key);
      const turkish = createTranslator({ locale: "tr", messages: tr, namespace: "modelLab" })(key);
      expect(english.length).toBeGreaterThan(0);
      expect(turkish).not.toBe(english);
    }
  );

  it("falls back to a generic message for an unknown code and to nothing without one", () => {
    expect(labRunErrorKey("something_new")).toBe("runErrors.other");
    expect(labRunErrorKey(null)).toBeNull();
    expect(createTranslator({ locale: "en", messages: en, namespace: "modelLab" })("runErrors.other")).toBe("The run ended with an error.");
  });
});
