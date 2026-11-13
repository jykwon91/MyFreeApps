/**
 * No-backend E2E for the signed-in account pages: Settings links to Security;
 * on Security the learner changes their display name, downloads their data and
 * deletes their account (password and email re-entered, plus a 2FA code when
 * 2FA is on). Each sends the right request and shows the outcome, and when the
 * server refuses it says so and keeps what was typed.
 */
import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { ME_PATH, stubAccountApi } from "@platform/ui/test-support/accountApi";
import { createGate } from "@platform/ui/test-support/gate";
import { json, plainText } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell, TEST_USER } from "@platform/ui/test-support/mockSession";
import { toast, toastAboveModal } from "@platform/ui/test-support/toast";
import { TEST_PASSWORD, TOTP_CODE, WRONG_PASSWORD } from "./constants/accountCredentials";
import { EXPORT_ROUTE } from "./constants/accountEndpoints";
import { INCORRECT_PASSWORD, INTERNAL_ERROR } from "./constants/refusalDetails";
import {
  DISPLAY_NAME_PLACEHOLDER,
  DISPLAY_NAME_SAVE_FAILED,
  DISPLAY_NAME_SAVED,
  EXPORT_DOWNLOADING,
  EXPORT_FAILED,
  EXPORT_PREPARING,
} from "./constants/accountCopy";
import { ACCOUNT_EXPORT } from "./fixtures/accountExport";

test("Settings links to Security", async ({ page }) => {
  await stubSignedInShell(page);

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("link", { name: /Two-factor authentication/ }).click();

  await expect(page).toHaveURL(/\/security$/);
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
});

test.describe("display name", () => {
  test("saves the trimmed name and then has nothing left to save", async ({ page }) => {
    await stubSignedInShell(page);
    const sent = await stubAccountApi(page);

    await page.goto("/security");
    const input = page.getByPlaceholder(DISPLAY_NAME_PLACEHOLDER);
    const save = page.getByRole("button", { name: "Save", exact: true });
    await expect(input).toHaveValue(TEST_USER.display_name);
    await expect(save).toBeDisabled();

    await input.fill("  Sam Learner ");
    await expect(save).toBeEnabled();
    await save.click();

    await expect(toast(page, DISPLAY_NAME_SAVED)).toBeVisible();
    await expect(save).toBeDisabled();
    expect(sent).toEqual([{ method: "PATCH", path: ME_PATH, body: { display_name: "Sam Learner" } }]);
  });

  test("a refused save says so and keeps what was typed so it can be sent again", async ({ page }) => {
    await stubSignedInShell(page);
    const sent = await stubAccountApi(page, { refuse: { status: 500, plainText: INTERNAL_ERROR } });

    await page.goto("/security");
    const input = page.getByPlaceholder(DISPLAY_NAME_PLACEHOLDER);
    await input.fill("Sam Learner");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(toast(page, DISPLAY_NAME_SAVE_FAILED)).toBeVisible();
    await expect(input).toHaveValue("Sam Learner");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    expect(sent).toHaveLength(1);
  });
});

test.describe("data export", () => {
  test("asks for the data with a GET, shows it is preparing, then downloads a dated JSON file with it", async ({ page }) => {
    await stubSignedInShell(page);
    const gate = createGate();
    const methods: string[] = [];
    await page.route(EXPORT_ROUTE, async (route) => {
      methods.push(route.request().method());
      await gate.wait;
      return route.fulfill(json(ACCOUNT_EXPORT));
    });

    try {
      await page.goto("/security");
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download my data" }).click();
      await expect(page.getByRole("button", { name: "Download my data" })).toBeDisabled();
      await expect(page.getByText(EXPORT_PREPARING)).toBeVisible();
      gate.release();

      const file = await download;
      expect(file.suggestedFilename()).toMatch(/^mylanguagetutor-export-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/);
      expect(JSON.parse(await readFile((await file.path()) ?? "", "utf8"))).toEqual(ACCOUNT_EXPORT);
      await expect(toast(page, EXPORT_DOWNLOADING)).toBeVisible();
      await expect(page.getByRole("button", { name: "Download my data" })).toBeEnabled();
      expect(methods).toEqual(["GET"]);
    } finally {
      gate.release();
    }
  });

  test("a failed export says so and can be tried again", async ({ page }) => {
    await stubSignedInShell(page);
    await page.route(EXPORT_ROUTE, (route) => route.fulfill(plainText(INTERNAL_ERROR, 500)));

    await page.goto("/security");
    await page.getByRole("button", { name: "Download my data" }).click();

    await expect(toast(page, EXPORT_FAILED)).toBeVisible();
    await expect(toast(page, EXPORT_DOWNLOADING)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Download my data" })).toBeEnabled();
  });
});

test.describe("delete account", () => {
  async function openDialog(page: Page) {
    await page.goto("/security");
    await page.getByRole("button", { name: "Delete my account" }).click();
    return page.getByRole("dialog", { name: "Delete account permanently" });
  }

  test("needs the email and password before it can be sent, and cancelling sends nothing", async ({ page }) => {
    await stubSignedInShell(page);
    const sent = await stubAccountApi(page);

    const dialog = await openDialog(page);
    const confirm = dialog.getByRole("button", { name: "Delete forever" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel("Type your email address to confirm").fill(TEST_USER.email);
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel("Password").fill(TEST_PASSWORD);
    await expect(confirm).toBeEnabled();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    expect(sent).toHaveLength(0);
  });

  test("deletes the account with the typed email and password, then signs the learner out", async ({ page }) => {
    await stubSignedInShell(page);
    const sent = await stubAccountApi(page);

    const dialog = await openDialog(page);
    await dialog.getByLabel("Type your email address to confirm").fill(TEST_USER.email);
    await dialog.getByLabel("Password").fill(TEST_PASSWORD);
    await dialog.getByRole("button", { name: "Delete forever" }).click();

    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("token"))).toBeNull();
    expect(sent).toEqual([
      { method: "DELETE", path: ME_PATH, body: { password: TEST_PASSWORD, confirm_email: TEST_USER.email, totp_code: null } },
    ]);
    await expect(page.getByRole("button", { name: "Delete my account" })).toHaveCount(0);
  });

  test("a wrong password (403) shows the server's reason and keeps the dialog, the typing and the session", async ({ page }) => {
    await stubSignedInShell(page);
    const sent = await stubAccountApi(page, { refuse: { status: 403, detail: INCORRECT_PASSWORD } });

    const dialog = await openDialog(page);
    await dialog.getByLabel("Type your email address to confirm").fill(TEST_USER.email);
    await dialog.getByLabel("Password").fill(WRONG_PASSWORD);
    await dialog.getByRole("button", { name: "Delete forever" }).click();

    await expect(toastAboveModal(page, INCORRECT_PASSWORD)).toBeVisible();
    await expect(dialog.getByLabel("Password")).toHaveValue(WRONG_PASSWORD);
    await expect(dialog.getByRole("button", { name: "Delete forever" })).toBeEnabled();
    expect(await page.evaluate(() => window.localStorage.getItem("token"))).not.toBeNull();
    expect(sent).toHaveLength(1);
  });

  test("with 2FA on, it also asks for the code and sends it", async ({ page }) => {
    const user = { ...TEST_USER, totp_enabled: true };
    await stubSignedInShell(page, { user });
    const sent = await stubAccountApi(page, { user });

    const dialog = await openDialog(page);
    const confirm = dialog.getByRole("button", { name: "Delete forever" });
    await dialog.getByLabel("Type your email address to confirm").fill(TEST_USER.email);
    await dialog.getByLabel("Password").fill(TEST_PASSWORD);
    await expect(confirm).toBeDisabled();

    await dialog.getByLabel("Two-factor authentication code").fill(`${TOTP_CODE.slice(0, 3)} ${TOTP_CODE.slice(3)}`);
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]).toEqual({
      method: "DELETE",
      path: ME_PATH,
      body: { password: TEST_PASSWORD, confirm_email: TEST_USER.email, totp_code: TOTP_CODE },
    });
  });
});
