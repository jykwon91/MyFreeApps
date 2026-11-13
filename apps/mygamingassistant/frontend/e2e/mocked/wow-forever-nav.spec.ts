/**
 * WoW Forever left-nav E2E tests.
 *
 * Run: npx playwright test --config=playwright.layout.config.ts wow-forever-nav
 *
 * Covers:
 *   - On /wow-forever/macros the sidebar shows the WoW section with Macros active
 *   - Clicking another section item navigates to that page
 *   - Collapse toggle: sidebar shrinks to icon rail, labels hidden
 *   - Reload after collapse: sidebar stays collapsed (localStorage persisted)
 *   - Expand: sidebar restores to full width
 *   - 375px: WoW group appears in mobile bottom nav, no overflow, ≥44px targets
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { MIN_TOUCH_TARGET } from "@platform/ui/test-support/constants/minTouchTarget";

const COLLAPSE_KEY = "platform.sidebar.collapsed.v1";

/** On desktop, selects the sidebar nav element. */
function sidebar(page: Page) {
  return page.locator("#main-sidebar");
}

/** Removes the collapse preference from localStorage so tests start fresh. */
async function clearCollapse(page: Page) {
  await page.evaluate((key) => {
    try { localStorage.removeItem(key); } catch { /* storage blocked */ }
  }, COLLAPSE_KEY);
}

// Any API call this spec does not stub (icons, prices, server status, ...) answers 404,
// so nothing reaches a backend through the dev server.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page);
});

test.describe("WoW Forever sidebar nav", () => {
  test.beforeEach(async ({ page }) => {
    // Reset collapse state so each test starts expanded.
    await page.goto("/wow-forever");
    await clearCollapse(page);
  });

  test("WoW section renders on /wow-forever/macros with Macros active", async ({ page }) => {
    await page.goto("/wow-forever/macros");
    const sb = sidebar(page);
    // Section header
    await expect(sb.getByText("WoW Forever")).toBeVisible();
    // All section items present
    await expect(sb.getByRole("link", { name: "Overview" })).toBeVisible();
    await expect(sb.getByRole("link", { name: "World Map" })).toBeVisible();
    await expect(sb.getByRole("link", { name: "Macros" })).toBeVisible();
    // Macros is marked as current page
    await expect(sb.getByRole("link", { name: "Macros" })).toHaveAttribute("aria-current", "page");
  });

  test("WoW section not shown on main Games page", async ({ page }) => {
    await page.goto("/");
    const sb = sidebar(page);
    // Section should be absent when route is not /wow-forever*
    await expect(sb.getByText("WoW Forever")).not.toBeVisible();
  });

  test("clicking World Map in the section navigates to the map page", async ({ page }) => {
    await page.goto("/wow-forever/macros");
    await sidebar(page).getByRole("link", { name: "World Map" }).click();
    await expect(page).toHaveURL(/\/wow-forever\/map/);
  });

  test("collapse toggle: sidebar shrinks and hides labels", async ({ page }) => {
    await page.goto("/wow-forever/map");
    const sb = sidebar(page);
    // Before collapse: "World Map" text label is visible
    await expect(sb.getByText("World Map")).toBeVisible();
    // Before collapse: section header visible
    await expect(sb.getByText("WoW Forever")).toBeVisible();
    // Click collapse
    await sb.getByRole("button", { name: "Collapse sidebar" }).click();
    // After collapse: text nodes are removed from DOM (icon-only rail)
    await expect(sb.getByText("World Map")).not.toBeVisible();
    await expect(sb.getByText("WoW Forever")).not.toBeVisible();
    // The link is still accessible via aria-label for screen readers / keyboard nav
    await expect(sb.getByRole("link", { name: "World Map" })).toHaveAttribute("aria-label", "World Map");
  });

  test("collapsed state persists across reload", async ({ page }) => {
    await page.goto("/wow-forever/map");
    // Collapse the sidebar
    await sidebar(page).getByRole("button", { name: "Collapse sidebar" }).click();
    // Reload the page
    await page.reload();
    // Sidebar should still be collapsed — toggle should offer "Expand sidebar"
    await expect(sidebar(page).getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  });

  test("expanding the sidebar restores labels", async ({ page }) => {
    await page.goto("/wow-forever/map");
    // Collapse then expand
    await sidebar(page).getByRole("button", { name: "Collapse sidebar" }).click();
    await sidebar(page).getByRole("button", { name: "Expand sidebar" }).click();
    // Labels are visible again
    await expect(sidebar(page).getByRole("link", { name: "World Map" })).toBeVisible();
    await expect(sidebar(page).getByText("WoW Forever")).toBeVisible();
  });
});

test.describe("WoW Forever mobile nav (375px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("WoW items appear in mobile bottom nav on a WoW route", async ({ page }) => {
    await page.goto("/wow-forever/macros");
    const mobileNav = page.getByRole("navigation", { name: "Mobile navigation" });
    // Overview link must be present
    await expect(mobileNav.getByRole("link", { name: "Overview" })).toBeVisible();
    // At least one more WoW item (World Map or Macros or Professions etc.)
    const wowLinks = await mobileNav.getByRole("link").count();
    expect(wowLinks).toBeGreaterThanOrEqual(2);
  });

  test("mobile nav shows main nav on non-WoW route", async ({ page }) => {
    await page.goto("/");
    const mobileNav = page.getByRole("navigation", { name: "Mobile navigation" });
    // Games link present (main nav)
    await expect(mobileNav.getByRole("link", { name: /games/i })).toBeVisible();
    // WoW Overview NOT present
    await expect(mobileNav.getByRole("link", { name: "Overview" })).not.toBeVisible();
  });

  test("no horizontal overflow at 375px on a WoW page", async ({ page }) => {
    await page.goto("/wow-forever/macros");
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("mobile bottom-nav touch targets are at least 44px tall", async ({ page }) => {
    await page.goto("/wow-forever/macros");
    const mobileNav = page.getByRole("navigation", { name: "Mobile navigation" });
    const links = await mobileNav.getByRole("link").all();
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const box = await link.boundingBox();
      expect(box, `link has no bounding box`).not.toBeNull();
      if (box) {
        expect(box.height, `touch target too short: ${box.height}px`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      }
    }
  });
});
