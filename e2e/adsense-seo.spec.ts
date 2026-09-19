import { expect, test } from "@playwright/test";

test("loads optional scripts only after the matching consent", async ({ page }) => {
  await page.goto("/tr");

  await expect(page.locator("#renderhane-adsense")).toHaveCount(0);
  await expect(page.locator("#renderhane-panola-analytics")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Çerez tercihleri" })).toBeVisible();

  await page.getByRole("button", { name: "Tümünü Kabul Et" }).click();

  await expect(page.locator("#renderhane-adsense")).toHaveCount(1);
  await expect(page.locator("#renderhane-panola-analytics")).toHaveCount(1);
  await expect(page.locator("#renderhane-google-analytics")).toHaveCount(1);

  const consent = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("cookie-consent-v2") || "null")
  );
  expect(consent).toMatchObject({ analytics: true, advertising: true, version: 2 });

  await page.goto("/tr/privacy");
  await expect(page).toHaveURL(/\/tr\/privacy$/);
  await expect(page.locator("#renderhane-adsense")).toHaveCount(0);
});

test("supports rejection and reopening granular preferences", async ({ page }) => {
  await page.goto("/tr/cookie-policy");
  await page.getByRole("button", { name: "Tümünü Reddet" }).click();

  await expect(page.locator("#renderhane-panola-analytics")).toHaveCount(0);
  await expect(page.locator("#renderhane-google-analytics")).toHaveCount(0);

  await page.getByRole("button", { name: "Çerez Tercihleri" }).click();
  await page.getByRole("checkbox", { name: "Analitik" }).check();
  await page.getByRole("button", { name: "Tercihleri Kaydet" }).click();

  await expect(page.locator("#renderhane-panola-analytics")).toHaveCount(1);
  await expect(page.locator("#renderhane-adsense")).toHaveCount(0);
});

test("keeps login out of Search and publishes a clean sitemap", async ({
  page,
  request,
}) => {
  await page.goto("/tr/login");

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex, nofollow/
  );
  await expect(page.locator("#renderhane-adsense")).toHaveCount(0);
  await expect(page.locator('meta[name="google-adsense-account"]')).toHaveAttribute(
    "content",
    /^ca-pub-\d{16}$/
  );

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).not.toContain("/_next/static/");

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).not.toContain("/login</loc>");
  expect(sitemap).toContain('hreflang="x-default"');
});
