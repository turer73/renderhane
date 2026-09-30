import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BUSINESS_FIELDS, BUSINESS_TITLES } from "../business-card";

const html = readFileSync(path.join(process.cwd(), "standalone/nfc-card/index.html"), "utf8");

describe("portable NFC card page", () => {
  it("uses the same field map as the site's /b page", () => {
    const json = /<script id="business-fields" type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(json).toBeDefined();
    const fields = JSON.parse(json!);
    for (const kind of ["bank", "invoice"] as const) {
      expect(fields[kind]).toEqual(
        BUSINESS_FIELDS[kind].map(({ key, param, label, required }) => ({ key, param, label, ...(required ? { required } : {}) }))
      );
    }
  });

  it("uses the same titles and invoice marker", () => {
    for (const kind of ["bank", "invoice"] as const)
      for (const locale of ["tr", "en"] as const) expect(html).toContain(`"${BUSINESS_TITLES[kind][locale]}"`);
    expect(html).toContain('params.get("t") === "f"');
  });

  it("stays self-contained", () => {
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|https?:\/\/(?!www\.renderhane\.com)/);
    expect(html).not.toMatch(/innerHTML/);
  });
});
