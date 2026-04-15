/**
 * E2E Tests: Workspace Tool Pages
 *
 * Tools are accessed via /app?tool=<id>.
 * Old /app/tools/<id> URLs redirect to /app?tool=<id> via middleware.
 * /app/workspace redirects to /app via middleware.
 */
import { test, expect } from "@playwright/test";

const WORKSPACE_TOOLS = [
  { id: "bg-remove", category: "image" },
  { id: "scene", category: "ecommerce" },
  { id: "aplus", category: "ecommerce" },
  { id: "3d-model", category: "3d-model" },
  { id: "enhance", category: "image" },
  { id: "video", category: "video" },
  { id: "image-edit", category: "image" },
  { id: "text-to-image", category: "image" },
  { id: "talking-avatar", category: "video" },
  { id: "logo", category: "design" },
  { id: "virtual-tryon", category: "ecommerce" },
  { id: "qr-code", category: "design" },
] as const;

async function gotoOrSkipAuth(page: import("@playwright/test").Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 25_000 });
  await page.waitForTimeout(2_000);
  if (page.url().includes("/login")) {
    test.skip(true, "Auth required — set E2E_USER_EMAIL/PASSWORD to enable");
  }
}

test.describe("Workspace — Direct Access", () => {
  for (const tool of WORKSPACE_TOOLS) {
    test(`/app?tool=${tool.id} loads without error`, async ({ page }) => {
      await gotoOrSkipAuth(page, `/tr/app?tool=${tool.id}`);
      expect(page.url()).toContain(`tool=${tool.id}`);

      const body = await page.textContent("body");
      expect(body).not.toContain("Internal Server Error");
      expect(body).not.toContain("Application error");
    });
  }

  test("workspace loads with default category at /app", async ({ page }) => {
    await gotoOrSkipAuth(page, "/tr/app");
    // Workspace should render without errors
    const body = await page.textContent("body");
    expect(body).not.toContain("Internal Server Error");
  });
});

test.describe("Workspace — Old URL Redirects", () => {
  for (const tool of WORKSPACE_TOOLS) {
    test(`/app/tools/${tool.id} redirects to /app?tool=${tool.id}`, async ({ page }) => {
      await gotoOrSkipAuth(page, `/tr/app/tools/${tool.id}`);
      // Should end up at /app with tool param (not /workspace)
      expect(page.url()).toContain("/app");
      expect(page.url()).toContain(`tool=${tool.id}`);
      expect(page.url()).not.toContain("/workspace");
    });
  }

  test("social-kit stays on its own page (no redirect)", async ({ page }) => {
    await gotoOrSkipAuth(page, "/tr/app/tools/social-kit");
    expect(page.url()).toContain("/tools/social-kit");
  });
});

test.describe("Workspace — Tool Selection", () => {
  test("/app shows workspace with tool category sidebar", async ({ page }) => {
    await gotoOrSkipAuth(page, "/tr/app");

    // Workspace should have category buttons (ToolIconSidebar)
    // Categories: 3D, image, video, ecommerce, design, batch
    const buttons = page.locator("button");
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(6);
  });
});
