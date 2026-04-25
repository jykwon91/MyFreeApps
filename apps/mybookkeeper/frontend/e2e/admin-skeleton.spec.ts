import { test, expect } from "./fixtures/auth";

test.describe("Admin page skeleton", () => {
  test("admin page shows skeleton while loading then renders content", async ({ authedPage: page }) => {
    // Intercept all admin API calls to delay them, forcing the skeleton to appear
    await page.route("**/api/admin/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue();
    });

    await page.goto("/admin");

    // The page-level skeleton should be visible (animate-pulse elements)
    const skeletonElements = page.locator(".animate-pulse");
    await expect(skeletonElements.first()).toBeVisible({ timeout: 5000 });

    // The actual content heading should NOT be visible yet while skeleton shows
    const heading = page.getByRole("heading", { name: "Admin" }).first();
    await expect(heading).not.toBeVisible();

    // After data loads, the skeleton disappears and real content appears
    await expect(heading).toBeVisible({ timeout: 15000 });
  });

  test("admin page skeleton mirrors loaded page structure", async ({ authedPage: page }) => {
    // Delay API responses to observe skeleton
    await page.route("**/api/admin/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue();
    });

    await page.goto("/admin");

    // Skeleton should show the stats card grid (4 cards in a grid)
    const skeletonGrid = page.locator(".grid.grid-cols-1.sm\\:grid-cols-2.lg\\:grid-cols-4");
    await expect(skeletonGrid).toBeVisible({ timeout: 5000 });

    // Skeleton should have tab bar placeholder
    const tabBarPlaceholder = page.locator(".border-b .flex.gap-4");
    await expect(tabBarPlaceholder).toBeVisible();

    // Wait for real content to load
    await expect(page.getByRole("heading", { name: "Admin" }).first()).toBeVisible({ timeout: 15000 });

    // After load, tab buttons should be present
    await expect(page.getByRole("tab", { name: "Users" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Organizations" })).toBeVisible();
  });

  test("admin page shows stats cards after load", async ({ authedPage: page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin" }).first()).toBeVisible({ timeout: 15000 });
    // Stats cards should be visible
    await expect(page.getByText(/users|organizations|documents|transactions/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("admin sidebar has navigation links", async ({ authedPage: page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin" }).first()).toBeVisible({ timeout: 15000 });
    // Sidebar nav items should be visible on desktop
    await expect(page.getByRole("link", { name: /back to app/i })).toBeVisible({ timeout: 5000 });
  });
});
