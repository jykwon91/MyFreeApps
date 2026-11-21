/**
 * No-backend E2E: the first Tab on a signed-in page lands on "Skip to main
 * content", and activating it moves focus into the page's main landmark so a
 * keyboard user gets past the sidebar.
 *
 * Runs under playwright.layout.config.ts with the API fully mocked.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page, { answer: "empty" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await plantAuth(page);
  await stubWorkspaceShell(page, "owner");
});

test("the first Tab shows a skip link that moves focus into main", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main")).toHaveCount(1);

  await expect(page.getByRole("navigation").first()).toBeVisible();
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});
