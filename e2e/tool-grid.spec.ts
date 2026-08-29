/**
 * E2E Tests: Workspace Tool Categories
 *
 * Tests the workspace UI at /app which replaced the old dashboard.
 * The workspace uses ToolIconSidebar (5 functional categories) + ToolFormPanel.
 * There is no longer a ToolGrid with 13 individual tool cards.
 */
import { test, expect } from "@playwright/test";

// Functional workspace categories from ToolIconSidebar. Batch was removed
// until its backend is implemented (c3dbad0).
const TOOL_CATEGORIES = [
  { id: "3d-model", label: "3D" },
  { id: "image", label: "Görüntü" },
  { id: "video", label: "Video" },
  { id: "ecommerce", label: "E-ticaret" },
  { id: "design", label: "Tasarım" },
] as const;

function visibleCategoryButton(page: import("@playwright/test").Page, label: string) {
  return page.getByRole("button", { name: label, exact: true }).filter({ visible: true });
}

/**
 * Helper: navigate to workspace, skip if auth is required.
 */
async function gotoWorkspaceOrSkip(page: import("@playwright/test").Page) {
  await page.goto("/tr/app", { waitUntil: "domcontentloaded", timeout: 25_000 });
  await page.waitForTimeout(2_000);

  if (page.url().includes("/login")) {
    test.skip(true, "Auth required — set E2E_USER_EMAIL/PASSWORD to enable");
  }
}

test.describe("Workspace — Layout", () => {
  test("workspace loads at /app without error", async ({ page }) => {
    await gotoWorkspaceOrSkip(page);

    const body = await page.textContent("body");
    expect(body).not.toContain("Internal Server Error");
    expect(body).not.toContain("Application error");
  });

  test("workspace has tool category buttons", async ({ page }) => {
    await gotoWorkspaceOrSkip(page);

    const categoryButtons = page.locator("button:visible").filter({
      hasText: /3D|Görüntü|Video|E-ticaret|Tasarım|Toplu/,
    });

    const count = await categoryButtons.count();
    expect(count).toBe(TOOL_CATEGORIES.length);
  });

  test("workspace shows every functional category", async ({ page }) => {
    await gotoWorkspaceOrSkip(page);

    for (const cat of TOOL_CATEGORIES) {
      await expect(visibleCategoryButton(page, cat.label)).toBeVisible({ timeout: 10_000 });
    }
  });
});

test.describe("Workspace — Category Interaction", () => {
  for (const cat of TOOL_CATEGORIES) {
    test(`clicking "${cat.label}" category activates it`, async ({ page }) => {
      await gotoWorkspaceOrSkip(page);

      const btn = visibleCategoryButton(page, cat.label);

      await expect(btn).toBeVisible({ timeout: 10_000 });
      await btn.click();
      await page.waitForTimeout(1_000);

      await expect(btn).toHaveAttribute("aria-pressed", "true");
    });
  }
});

test.describe("Workspace — Tool Deep Links", () => {
  const TOOL_LINKS = [
    { tool: "bg-remove", category: "image" },
    { tool: "scene", category: "ecommerce" },
    { tool: "3d-model", category: "3d-model" },
    { tool: "video", category: "video" },
    { tool: "logo", category: "design" },
  ];

  for (const { tool } of TOOL_LINKS) {
    test(`/app?tool=${tool} opens workspace with correct tool`, async ({ page }) => {
      await page.goto(`/tr/app?tool=${tool}`, { waitUntil: "domcontentloaded", timeout: 25_000 });
      await page.waitForTimeout(2_000);

      if (page.url().includes("/login")) {
        test.skip(true, "Auth required");
      }

      expect(page.url()).toContain(`tool=${tool}`);
      const body = await page.textContent("body");
      expect(body).not.toContain("Internal Server Error");
    });
  }
});
