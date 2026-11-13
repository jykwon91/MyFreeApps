/**
 * No-backend E2E for the account pages: Settings links to Security, and
 * Security loads the operator's display name and 2FA state, then saves a new
 * display name.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { TOTP_STATUS_ENDPOINT } from "@platform/ui/test-support/constants/totpStatusEndpoint";
import { ME_PATH, stubAccountApi } from "@platform/ui/test-support/accountApi";
import { json } from "@platform/ui/test-support/mockResponse";
import { TEST_USER, stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { toast } from "@platform/ui/test-support/toast";

test.beforeEach(async ({ page }) => {
  await stubSignedInShell(page);
  await page.route(TOTP_STATUS_ENDPOINT, (route) => route.fulfill(json({ enabled: false })));
});

test("Settings links to Security", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: /Two-factor authentication/ }).click();

  await expect(page).toHaveURL(/\/security$/);
  await expect(page.getByRole("heading", { name: "Security", level: 1 })).toBeVisible();
});

test("Security loads the display name and saves a new, trimmed one", async ({ page }) => {
  const sent = await stubAccountApi(page);

  await page.goto("/security");
  const input = page.getByPlaceholder("e.g. Jane Smith");
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(input).toHaveValue(TEST_USER.display_name);
  await expect(page.getByRole("button", { name: "Enable 2FA" })).toBeVisible();
  await expect(save).toBeDisabled();

  await input.fill("  Jane Smith ");
  await save.click();

  await expect(toast(page, "Display name saved.")).toBeVisible();
  await expect(save).toBeDisabled();
  expect(sent).toEqual([{ method: "PATCH", path: ME_PATH, body: { display_name: "Jane Smith" } }]);
});
