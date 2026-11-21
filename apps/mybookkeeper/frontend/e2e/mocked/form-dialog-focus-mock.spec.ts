/**
 * No-backend E2E for keyboard and screen-reader handling of the form dialogs.
 *
 * The dialogs were plain overlays: focus stayed on the page behind them, Tab
 * walked out into that page, Escape did nothing, and closing left focus
 * nowhere. They now behave as modal dialogs.
 *
 * Verifies, on Add mortgage:
 *   - It is announced as a dialog named "Add mortgage", the page behind is
 *     hidden from screen readers, and focus moves into it.
 *   - Tabbing round it many times never leaves it.
 *   - Escape closes it and focus goes back to the Add button.
 *   - A click on the backdrop leaves it open, so a stray click can't discard
 *     a half-filled form.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { stubDocumentPages } from "./fixtures/mockDocuments";
import type { AttributionReviewQueueResponse } from "@mybookkeeper/api-client/types/attribution/attribution-review-queue-response";

const PROPERTIES = [
  {
    id: "00000000-0000-0000-0000-0000000000e1",
    name: "E2E Peerless",
    address: "1 Peerless St",
    classification: "investment",
    type: "long_term",
    is_active: true,
    activity_periods: [],
    created_at: "2026-01-01T00:00:00Z",
  },
];

const EMPTY_MORTGAGES = { items: [], total: 0, has_more: false };

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page, { answer: "empty" });
  await plantAuth(page);
  await stubWorkspaceShell(page, "owner");
  await page.route("**/api/transactions/attribution-review-queue*", (route) =>
    route.fulfill(json({ items: [], total: 0, pending_count: 0 } satisfies AttributionReviewQueueResponse)),
  );
  await page.route("**/api/properties", (route) => route.fulfill(json(PROPERTIES)));
  await page.route("**/api/mortgages?*", (route) => route.fulfill(json(EMPTY_MORTGAGES)));
  await page.route("**/api/mortgages", (route) => route.fulfill(json(EMPTY_MORTGAGES)));
  await stubDocumentPages(page, []);
});

test.describe("Add mortgage dialog — focus and Escape", () => {
  test("focus moves in, Tab stays inside, Escape closes and focus returns to the opener", async ({ page }) => {
    await page.goto("/mortgages");
    const opener = page.getByTestId("add-mortgage-button");
    await opener.click({ timeout: 15000 });

    const dialog = page.getByRole("dialog", { name: "Add mortgage" });
    await expect(dialog).toBeVisible();
    // The page behind is hidden from screen readers while the dialog is open.
    await expect(page.getByRole("main")).toHaveCount(0);
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    for (let i = 0; i < 40; i += 1) {
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

    await expect(page.getByTestId("add-mortgage-dialog")).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("a click on the backdrop leaves it open", async ({ page }) => {
    await page.goto("/mortgages");
    await page.getByTestId("add-mortgage-button").click({ timeout: 15000 });
    const property = page.getByTestId("mortgage-property-select");
    await property.selectOption(PROPERTIES[0].id);

    await page.mouse.click(5, 5);

    // Not a retrying assertion: a dialog that closed on the click must fail here.
    expect(await page.getByTestId("add-mortgage-dialog").isVisible()).toBe(true);
    await expect(property).toHaveValue(PROPERTIES[0].id);
  });
});
