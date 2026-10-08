import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import tr from "@/messages/tr.json";
import en from "@/messages/en.json";
import { LAB_CATALOG } from "../model-lab-catalog";

function leafKeys(value: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === "string" ? [prefix + key] : leafKeys(child as Record<string, unknown>, prefix + key + ".")
  ).sort();
}

describe("model lab translations", () => {
  it("keeps Turkish and English message keys in parity", () => {
    expect(leafKeys(tr.modelLab)).toEqual(leafKeys(en.modelLab));
  });

  it.each([{ locale: "tr", messages: tr }, { locale: "en", messages: en }])("covers every catalog field and status in $locale", ({ messages }) => {
    for (const model of LAB_CATALOG) {
      expect(Object.hasOwn(messages.modelLab.categories, model.category)).toBe(true);
      expect(Object.hasOwn(messages.modelLab.statuses, model.status)).toBe(true);
    }
    const missing = [...new Set(LAB_CATALOG.flatMap((model) => model.fields.map((field) => field.key)))].filter((key) => !Object.hasOwn(messages.modelLab.fields, key));
    expect(missing).toEqual([]);
  });

  it.each([
    { locale: "tr", messages: tr, title: "Model Laboratuvarı", consent: "sağlayıcı ücretini", abort: "Hiçbir ücretli istek gönderilmedi" },
    { locale: "en", messages: en, title: "Model Lab", consent: "provider charge", abort: "No paid request was sent" },
  ])("uses localized headings and spend safeguards in $locale", ({ locale, messages, title, consent, abort }) => {
    const t = createTranslator({ locale, messages, namespace: "modelLab" });
    expect(t("title")).toBe(title);
    expect(t("consent")).toContain(consent);
    expect(t("storageAbort")).toContain(abort);
    expect(t("shown", { shown: 1, total: 68 })).toContain("1 / 68");
    expect(t("request", { requestId: "request-123" })).toContain("request-123");
  });
});
