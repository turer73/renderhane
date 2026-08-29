import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("search crawler routes", () => {
  it("keeps render-critical Next.js assets crawlable", () => {
    const rules = robots().rules;
    const firstRule = Array.isArray(rules) ? rules[0] : rules;
    const disallow = Array.isArray(firstRule.disallow)
      ? firstRule.disallow
      : [firstRule.disallow];

    expect(disallow).not.toContain("/_next/static/");
    expect(disallow).toContain("/tr/app/");
  });

  it("publishes only indexable pages with reciprocal locale alternatives", () => {
    const entries = sitemap();

    expect(entries.some((entry) => entry.url.endsWith("/login"))).toBe(false);
    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      expect(entry.alternates?.languages).toMatchObject({
        tr: expect.stringContaining("/tr"),
        en: expect.stringContaining("/en"),
        "x-default": expect.stringContaining("/tr"),
      });
    }
  });
});
