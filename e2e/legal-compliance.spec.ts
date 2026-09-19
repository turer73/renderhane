import { expect, test } from "@playwright/test";

const legalPages = [
  { path: "privacy", heading: "Gizlilik Politikası" },
  { path: "terms", heading: "Kullanım Koşulları" },
  { path: "kvkk", heading: "KVKK Aydınlatma Metni" },
  { path: "cookie-policy", heading: "Çerez ve Benzeri Teknolojiler Politikası" },
];

for (const legalPage of legalPages) {
  test(`${legalPage.path} publishes the current Turkish legal text`, async ({ page }) => {
    await page.goto(`/tr/${legalPage.path}`);

    await expect(page).toHaveURL(new RegExp(`/tr/${legalPage.path}$`));
    await expect(page.getByRole("heading", { level: 1, name: legalPage.heading })).toBeVisible();
    await expect(page.getByText("Son güncelleme: 2026-09-19")).toBeVisible();
    await expect(page.locator("main")).not.toContainText("yeterli koruma sağlanarak");
    await expect(page.locator("main")).not.toContainText("Satın alınan krediler iade edilemez");
  });
}

test("KVKK notice identifies the controller and application channels", async ({ page }) => {
  await page.goto("/tr/kvkk");

  await expect(page.locator("main")).toContainText("Turgut Ürer");
  await expect(page.locator("main")).toContainText("Hasan Çelebi Sokak No: 19");
  await expect(page.locator("main")).toContainText("turgut.urer@gmail.com");
  await expect(page.locator("main")).toContainText("KVKK m.9");
});

test("landing avoids unsupported absolute performance and customer-count claims", async ({ page }) => {
  await page.goto("/tr");

  await expect(page.locator("body")).not.toContainText("500+ mağaza");
  await expect(page.locator("body")).not.toContainText("%94-250 dönüşüm");
  await expect(page.locator("body")).not.toContainText("%95 altında");
  await expect(page.locator("body")).toContainText("Sonuçlar ürüne, mağazaya ve kullanım biçimine göre değişir");
});
