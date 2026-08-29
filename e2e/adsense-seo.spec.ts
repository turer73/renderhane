import { expect, test } from "@playwright/test";

test("loads AdSense only after denied consent defaults on publisher content", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const originalAppendChild = Node.prototype.appendChild;
    Node.prototype.appendChild = function <T extends Node>(node: T): T {
      if (node instanceof HTMLScriptElement && node.id === "renderhane-adsense") {
        const dataLayer = (window as typeof window & { dataLayer?: ArrayLike<unknown>[] })
          .dataLayer;
        const hasDeniedDefault = Array.from(dataLayer ?? []).some((entry) => {
          const command = Array.from(entry ?? []);
          return command[0] === "consent" && command[1] === "default";
        });
        (window as typeof window & { adsConsentBeforeInsert?: boolean })
          .adsConsentBeforeInsert = hasDeniedDefault;
      }
      return originalAppendChild.call(this, node) as T;
    };
  });

  await page.goto("/tr");

  const adScript = page.locator("#renderhane-adsense");
  await expect(adScript).toHaveCount(1);
  await expect(adScript).toHaveAttribute(
    "src",
    /pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-\d{16}/
  );
  await expect(adScript).not.toHaveAttribute("data-nscript", /.+/);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { adsConsentBeforeInsert?: boolean })
            .adsConsentBeforeInsert
      )
    )
    .toBe(true);

  await page.goto("/tr/privacy");
  await expect(page).toHaveURL(/\/tr\/privacy$/);
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
