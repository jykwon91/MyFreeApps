/**
 * No-backend E2E for what the next account finds after one signs out: a reminder the first one
 * dismissed is back (here the Security page's two-step intro), and the folded board lanes are open.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";

const INTRO_KEY = "mjh-security-info-dismissed";
const LANE_KEY = "mjh_kanban_lane_strong_fit";
const INTRO_TEXT = /Two-factor authentication adds an extra layer of security/;

test("signing out brings back the dismissed intro and unfolds the board lanes", async ({ page }) => {
  await stubSignedInShell(page);
  await page.goto("/security");
  await expect(page.getByText(INTRO_TEXT)).toBeVisible();
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.getByText(INTRO_TEXT)).toBeHidden();
  await page.evaluate((key) => window.localStorage.setItem(key, "true"), LANE_KEY);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), INTRO_KEY)).toBe("1");

  await page.getByRole("button", { name: /Test User/ }).first().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), INTRO_KEY)).toBeNull();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), LANE_KEY)).toBeNull();
});
