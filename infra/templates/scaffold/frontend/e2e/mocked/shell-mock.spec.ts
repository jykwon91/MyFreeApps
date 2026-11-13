/**
 * No-backend E2E for the signed-in shell: it shows the operator and its
 * navigation, every nav link lands on its page, an operator with no display
 * name is shown by their email, and signing out ends the session.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { TOTP_STATUS_ENDPOINT } from "@platform/ui/test-support/constants/totpStatusEndpoint";
import { escapeRegExp } from "@platform/ui/test-support/escapeRegExp";
import { json } from "@platform/ui/test-support/mockResponse";
import { TEST_USER, stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { LANDING_HEADING } from "./constants/signInCopy";
import { SHELL_PAGES } from "./constants/shellPages";

test.beforeEach(async ({ page }) => {
  await page.route(TOTP_STATUS_ENDPOINT, (route) => route.fulfill(json({ enabled: false })));
});

test("shows the operator and the navigation, whose every link lands on its page", async ({ page }) => {
  await stubSignedInShell(page);

  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(page.getByRole("heading", { name: LANDING_HEADING, level: 1 })).toBeVisible();
  await expect(page.getByText(TEST_USER.display_name, { exact: true })).toBeVisible();
  await expect(page.getByText(TEST_USER.email, { exact: true })).toBeVisible();
  await expect(nav.getByRole("link")).toHaveText(SHELL_PAGES.map(({ label }) => label));

  for (const { label, path, heading } of [...SHELL_PAGES].reverse()) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(path)}$`));
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
  }
});

test("an operator without a display name is shown by their email's local part", async ({ page }) => {
  await stubSignedInShell(page, { user: { ...TEST_USER, display_name: "" } });

  await page.goto("/");
  await expect(page.getByText(TEST_USER.email.split("@")[0], { exact: true })).toBeVisible();
});

test("signing out clears the session and returns to /login", async ({ page }) => {
  await stubSignedInShell(page);

  await page.goto("/");
  await page.getByText(TEST_USER.display_name, { exact: true }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("token"))).toBeNull();
});
