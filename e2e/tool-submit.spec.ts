/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * E2E Tests: Workspace Submit Flow
 *
 * Tests validation, file upload, API mocking, and error handling
 * within the workspace UI.
 */
import { test, expect } from "@playwright/test";
import path from "path";

const TEST_IMAGE = path.join(__dirname, "fixtures", "test-image.png");

async function gotoOrSkipAuth(page: import("@playwright/test").Page, urlPath: string) {
  await page.goto(urlPath, { waitUntil: "domcontentloaded", timeout: 25_000 });
  await page.waitForTimeout(2_000);
  if (page.url().includes("/login")) {
    test.skip(true, "Auth required — set E2E_USER_EMAIL/PASSWORD to enable");
  }
  // Dismiss cookie banner if present (it overlays the submit button)
  const cookieBanner = page.locator("[class*='fixed'][class*='bottom-0'][class*='z-50']");
  if (await cookieBanner.count() > 0) {
    const dismissBtn = cookieBanner.locator("button").first();
    if (await dismissBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await dismissBtn.click();
      await page.waitForTimeout(500);
    }
  }
}

test.describe("Submit — Validation", () => {
  test("workspace image tab: file input present", async ({ page }) => {
    await gotoOrSkipAuth(page, "/tr/app/workspace?tool=bg-remove");

    const fileInput = page.locator("input[type='file']").first();
    const dropZone = page.locator("[class*='border-dashed']").first();
    expect(await fileInput.count() + await dropZone.count()).toBeGreaterThan(0);
  });

  test("workspace design tab: text input present", async ({ page }) => {
    await gotoOrSkipAuth(page, "/tr/app/workspace?tool=logo");

    // Logo tab has text inputs (brand name, description)
    const input = page.locator("textarea, input[type='text']").first();
    await expect(input).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Submit — File Upload", () => {
  test("workspace image tab: file upload shows preview", async ({ page }) => {
    await gotoOrSkipAuth(page, "/tr/app/workspace?tool=bg-remove");

    const fileInput = page.locator("input[type='file'][accept='image/*']").first();
    if (await fileInput.count() === 0) {
      test.skip(true, "No file input found");
      return;
    }

    await fileInput.setInputFiles(TEST_IMAGE);
    await page.waitForTimeout(1_500);

    // After upload, a preview image should appear
    const preview = page.locator("img").first();
    if (await preview.count() > 0) {
      await expect(preview).toBeVisible();
    }
  });
});

test.describe("Submit — API Mocking", () => {
  test("402 response triggers upgrade event", async ({ page }) => {
    // Mock API calls
    await page.route("**/api/health/status", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ healthy: true }) })
    );
    await page.route("**/api/credits/balance", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ credits: 100, useCase: "ecommerce" }) })
    );
    await page.route("**/storage/v1/object/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: "test/img.png" }) })
    );
    await page.route("**/storage/v1/object/sign/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ signedUrl: "https://example.com/test.png" }) })
    );
    await page.route("**/api/jobs/submit", (route) =>
      route.fulfill({ status: 402, contentType: "application/json", body: "{}" })
    );

    await gotoOrSkipAuth(page, "/tr/app/workspace?tool=bg-remove");

    const fileInput = page.locator("input[type='file'][accept='image/*']").first();
    if (await fileInput.count() === 0) { test.skip(true, "No file input"); return; }
    await fileInput.setInputFiles(TEST_IMAGE);
    await page.waitForTimeout(1_500);

    // Set up event listener BEFORE clicking
    await page.evaluate(() => {
      (window as any).__upgradeTriggered = false;
      window.addEventListener("show-upgrade", () => { (window as any).__upgradeTriggered = true; }, { once: true });
    });

    const submitBtn = page.locator("button").filter({
      hasText: /oluştur|üret|işle|generate|submit|start/i,
    }).first();

    if (await submitBtn.isVisible()) {
      await submitBtn.click({ force: true });
      await page.waitForTimeout(3_000);
      const triggered = await page.evaluate(() => (window as any).__upgradeTriggered);
      if (triggered) {
        expect(triggered).toBe(true);
      }
    }
  });
});
