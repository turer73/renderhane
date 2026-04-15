/**
 * E2E Tests: Tool Grid (Dashboard)
 *
 * Tests the ToolGrid component on the dashboard.
 * All 13 tool buttons should be visible, clickable, and navigate correctly.
 */
import { test, expect } from "@playwright/test";

// All 13 tools from registry.ts
const TOOLS = [
  { id: "bg-remove", icon: "✂️", href: "/app/workspace?tool=bg-remove" },
  { id: "scene", icon: "🎨", href: "/app/workspace?tool=scene" },
  { id: "aplus", icon: "⭐", href: "/app/workspace?tool=aplus" },
  { id: "3d-model", icon: "📦", href: "/app/workspace?tool=3d-model" },
  { id: "enhance", icon: "✨", href: "/app/workspace?tool=enhance" },
  { id: "video", icon: "🎬", href: "/app/workspace?tool=video" },
  { id: "image-edit", icon: "🖌️", href: "/app/workspace?tool=image-edit" },
  { id: "social-kit", icon: "📱", href: "/app/tools/social-kit" },
  { id: "text-to-image", icon: "🖼️", href: "/app/workspace?tool=text-to-image" },
  { id: "talking-avatar", icon: "🗣️", href: "/app/workspace?tool=talking-avatar" },
  { id: "logo", icon: "💎", href: "/app/workspace?tool=logo" },
  { id: "virtual-tryon", icon: "👗", href: "/app/workspace?tool=virtual-tryon" },
  { id: "qr-code", icon: "📷", href: "/app/workspace?tool=qr-code" },
] as const;

/**
 * Helper: navigate to dashboard, skip if auth is required.
 * Uses domcontentloaded to avoid SSR timeout issues.
 */
async function gotoDashboardOrSkip(page: import("@playwright/test").Page) {
  await page.goto("/tr/app", { waitUntil: "domcontentloaded", timeout: 25_000 });

  // Wait a moment for client-side redirect
  await page.waitForTimeout(2_000);

  if (page.url().includes("/login")) {
    test.skip(true, "Auth required — set E2E_USER_EMAIL/PASSWORD to enable");
  }
}

test.describe("Tool Grid — Dashboard", () => {
  test("dashboard loads with tool grid", async ({ page }) => {
    await gotoDashboardOrSkip(page);

    const grid = page.locator(".grid.grid-cols-2");
    await expect(grid).toBeVisible({ timeout: 15_000 });

    const buttons = grid.locator("button");
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(6);
  });

  test("all 13 tool cards are rendered", async ({ page }) => {
    await gotoDashboardOrSkip(page);

    const grid = page.locator(".grid.grid-cols-2");
    await expect(grid).toBeVisible({ timeout: 15_000 });

    const buttons = grid.locator("button");
    await expect(buttons).toHaveCount(13);
  });

  test("each tool card shows icon and credit cost", async ({ page }) => {
    await gotoDashboardOrSkip(page);

    const grid = page.locator(".grid.grid-cols-2");
    await expect(grid).toBeVisible({ timeout: 15_000 });

    for (const tool of TOOLS) {
      const card = grid.locator(`button:has-text("${tool.icon}")`);
      await expect(card).toBeVisible();

      const text = await card.textContent();
      expect(text).toMatch(/kredi|Ücretsiz|credits|Free/);
    }
  });

  for (const tool of TOOLS) {
    test(`tool "${tool.id}" navigates to ${tool.href}`, async ({ page }) => {
      await gotoDashboardOrSkip(page);

      const grid = page.locator(".grid.grid-cols-2");
      await expect(grid).toBeVisible({ timeout: 15_000 });

      const card = grid.locator(`button:has-text("${tool.icon}")`);
      await expect(card).toBeVisible();

      await card.click();
      // Escape /, ? and = for regex matching
      const hrefPattern = tool.href.replace(/[/?=]/g, (c) => `\\${c}`);
      await page.waitForURL(new RegExp(hrefPattern), {
        timeout: 25_000,
        waitUntil: "domcontentloaded",
      });
      expect(page.url()).toContain(tool.href);
    });
  }

  test("all tool cards are enabled (not disabled)", async ({ page }) => {
    await gotoDashboardOrSkip(page);

    const grid = page.locator(".grid.grid-cols-2");
    await expect(grid).toBeVisible({ timeout: 15_000 });

    const buttons = grid.locator("button");
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const isDisabled = await btn.getAttribute("disabled");
      expect(isDisabled).toBeNull();
    }
  });

  test("tool cards have cursor-pointer class", async ({ page }) => {
    await gotoDashboardOrSkip(page);

    const grid = page.locator(".grid.grid-cols-2");
    await expect(grid).toBeVisible({ timeout: 15_000 });

    const firstCard = grid.locator("button").first();
    const classes = await firstCard.getAttribute("class");
    expect(classes).toContain("cursor-pointer");
  });
});
