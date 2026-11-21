/**
 * No-backend E2E: the first Tab on a signed-in page lands on "Skip to main
 * content", and activating it moves focus into the page's main landmark so a
 * keyboard user gets past the sidebar.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";

test("the first Tab shows a skip link that moves focus into main", async ({ page }) => {
  await stubSignedInShell(page);
  await page.route(/\/api\/applications(\?|$)/, (route) => route.fulfill(json({ items: [], total: 0 })));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/applications");
  await expect(page.locator("main")).toHaveCount(1);

  await expect(page.getByRole("navigation").first()).toBeVisible();
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});
