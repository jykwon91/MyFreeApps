/**
 * No-backend E2E for keyboard and screen-reader handling of the Add Document
 * dialog on /documents.
 *
 * It was a plain overlay: focus stayed on the page behind it, Tab walked out
 * into that page, Escape did nothing, and closing left focus nowhere. It is
 * now a modal dialog.
 *
 * Verifies, driven by keyboard:
 *   - It opens from "Add document", is announced as a dialog named "Add
 *     Document", the page behind is hidden from screen readers, and focus
 *     moves into it.
 *   - Tabbing round it many times never leaves it.
 *   - Escape closes it and focus goes back to "Add document".
 *   - A click on the backdrop still closes it, as before.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";

const DOCUMENTS_ENDPOINT = /\/api\/documents(\?|$)/;

test.beforeEach(async ({ page }) => {
  await stubSignedInShell(page);
  await page.route(DOCUMENTS_ENDPOINT, (route) => route.fulfill(json({ items: [], total: 0 })));
});

test("focus moves in, Tab stays inside, Escape closes and focus returns to the opener", async ({ page }) => {
  await page.goto("/documents");
  const opener = page.getByRole("button", { name: "Add document" });
  await opener.focus({ timeout: 15000 });
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "Add Document" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(0);
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
      `Tab ${i + 1} moved focus out of the dialog`,
    ).toBe(true);
  }
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press("Shift+Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }

  await page.keyboard.press("Escape");

  await expect(page.getByTestId("document-upload-dialog")).toBeHidden();
  await expect(opener).toBeFocused();
});

test("a click on the backdrop closes it, a click inside does not", async ({ page }) => {
  await page.goto("/documents");
  await page.getByRole("button", { name: "Add document" }).click({ timeout: 15000 });
  const dialog = page.getByRole("dialog", { name: "Add Document" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("heading", { name: "Add Document" }).click();
  expect(await dialog.isVisible()).toBe(true);

  await page.mouse.click(5, 5);

  await expect(dialog).toBeHidden();
});
