/**
 * E2E Tests: Login Page (no auth required)
 *
 * These tests run without authentication and verify
 * the login page UI and redirect behavior.
 */
import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } }); // Force no auth

test.describe("Login Page", () => {
  test("login page loads correctly", async ({ page }) => {
    await page.goto("/tr/login", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/tr\/login/);
  });

  test("login page shows Google sign-in button", async ({ page }) => {
    await page.goto("/tr/login", { waitUntil: "domcontentloaded" });

    // Google login button should be visible
    const googleBtn = page.locator("button").filter({
      hasText: /google/i,
    });
    await expect(googleBtn).toBeVisible({ timeout: 10_000 });
  });

  test("login page shows magic link email input", async ({ page }) => {
    await page.goto("/tr/login", { waitUntil: "domcontentloaded" });

    // Email input should exist
    const emailInput = page.locator("input[type='email'], input[placeholder*='mail']");
    await expect(emailInput).toBeVisible({ timeout: 10_000 });
  });

  test("no visible error banner on initial load", async ({ page }) => {
    await page.goto("/tr/login", { waitUntil: "domcontentloaded" });

    // No visible error alert/banner on fresh load
    // (some elements may have red classes for styling, so check for visible error *banners*)
    const errorBanner = page.locator("[role='alert'], .error-message, [data-error]");
    expect(await errorBanner.count()).toBe(0);
  });

  test("unauthenticated /app redirect goes to login", async ({ page }) => {
    await page.goto("/tr/app", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3_000);

    // Should redirect to login
    expect(page.url()).toContain("/login");
  });

  test("unauthenticated workspace page redirects to login", async ({ page }) => {
    await page.goto("/tr/app/workspace?tool=bg-remove", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3_000);

    expect(page.url()).toContain("/login");
  });

  test("unauthenticated old tool URL redirects through to login", async ({ page }) => {
    await page.goto("/tr/app/tools/bg-remove", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3_000);

    expect(page.url()).toContain("/login");
  });
});

test.describe("Landing Page — Tool Links", () => {
  test("landing page loads", async ({ page }) => {
    await page.goto("/tr", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/tr\/?$/);

    const body = await page.textContent("body");
    expect(body).not.toContain("Internal Server Error");
  });

  test("landing page has CTA buttons", async ({ page }) => {
    await page.goto("/tr", { waitUntil: "domcontentloaded" });

    // There should be at least one call-to-action button
    const ctaButtons = page.locator("a, button").filter({
      hasText: /başla|dene|ücretsiz|start|try|free/i,
    });

    const count = await ctaButtons.count();
    expect(count).toBeGreaterThan(0);
  });
});
