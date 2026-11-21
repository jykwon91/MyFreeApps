/**
 * No-backend E2E for the slide-in menu MyBookkeeper shows on phone-width
 * screens. Closed, its links must be out of the tab order; open, it holds
 * focus, closes on Escape, and gives focus back to the menu button.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";

test.use({ viewport: { width: 375, height: 667 } });

async function openApp(page: Page) {
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "owner");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test("tabbing from the top never lands on the closed menu's links", async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole("link", { name: "Transactions" })).toHaveCount(0);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    const inSidebar = await page.evaluate(() => document.activeElement?.closest("aside") !== null);
    expect(inSidebar, `tab stop ${i + 2} is inside the closed sidebar`).toBe(false);
  }
});

test("Escape closes the open menu and focus goes back to the menu button", async ({ page }) => {
  await openApp(page);
  const opener = page.getByRole("button", { name: "Open menu" });

  await opener.click();
  const menu = page.getByRole("dialog", { name: "MyBookkeeper" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link", { name: "Transactions" })).toBeVisible();
  expect(await menu.evaluate((el) => el.contains(document.activeElement))).toBe(true);

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(opener).toBeFocused();
});

test("following a link closes the menu and focus goes back to the menu button", async ({ page }) => {
  await openApp(page);
  const opener = page.getByRole("button", { name: "Open menu" });

  await opener.click();
  const menu = page.getByRole("dialog", { name: "MyBookkeeper" });
  await menu.getByRole("link", { name: "Dashboard" }).click();
  await expect(menu).toBeHidden();
  await expect(opener).toBeFocused();
});

test("the user menu opens and closes from the keyboard", async ({ page }) => {
  await openApp(page);
  const opener = page.getByRole("button", { name: "Open menu" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("dialog", { name: "MyBookkeeper" });
  await expect(menu).toBeVisible();

  // While the user menu is open the rest of the page, sidebar included, is
  // hidden from assistive tech, so find the toggle with hidden elements too.
  const userToggle = page.getByRole("button", { name: /test user/i, includeHidden: true });
  await expect(userToggle).toHaveAttribute("aria-haspopup", "menu");
  await expect(userToggle).toHaveAttribute("aria-expanded", "false");
  await userToggle.focus();
  await page.keyboard.press("Enter");

  const signOut = page.getByRole("menuitem", { name: "Sign out" });
  await expect(signOut).toBeVisible();
  await expect(userToggle).toHaveAttribute("aria-expanded", "true");
  await expect(signOut).toBeFocused();

  // The first Escape closes only the user menu; the sidebar stays open.
  await page.keyboard.press("Escape");
  await expect(signOut).toBeHidden();
  await expect(userToggle).toBeFocused();
  await expect(menu).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(opener).toBeFocused();
});
