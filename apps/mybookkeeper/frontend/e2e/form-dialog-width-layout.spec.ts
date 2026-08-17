import { test, expect, type Page } from "./fixtures/auth";
import { FORM_DIALOG_MIN_WIDE_PX, FORM_DIALOG_MAX_NARROW_PX } from "./fixtures/config";

/**
 * Layout E2E for the shared form-dialog shell.
 *
 * The add/edit policy and plan forms pair their fields two to a row. Rendered
 * in the shell's narrow width those rows have nowhere to sit, and the dialog
 * becomes a tall ribbon stranded in an empty viewport — the state this file
 * exists to keep from coming back.
 *
 * Measures the rendered box rather than asserting a class name, because that
 * is the layer where a purged utility or a competing `max-w-*` further down the
 * cascade would actually show up. Unit tests cover which width each dialog
 * asks for; this covers whether the browser honours it.
 *
 * Read-only — opens dialogs and closes them, seeds nothing.
 */

const DESKTOP = { width: 1280, height: 900 };

/** The element carrying the max-width: the panel inside the backdrop. */
function panelOf(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"] > div`);
}

async function widthOf(page: Page, testId: string): Promise<number> {
  const panel = panelOf(page, testId);
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  if (!box) throw new Error(`${testId} has no bounding box`);
  return box.width;
}

test.describe("form dialog width", () => {
  test.use({ viewport: DESKTOP });

  test("the add-policy form gets room for its paired fields", async ({
    authedPage: page,
  }) => {
    await page.goto("/insurance-policies");
    await page.getByRole("button", { name: "Add policy" }).click();

    const width = await widthOf(page, "add-insurance-policy-dialog");
    expect(width).toBeGreaterThan(FORM_DIALOG_MIN_WIDE_PX);
    expect(width).toBeLessThanOrEqual(DESKTOP.width);
  });

  test("the add-plan form gets the same room", async ({ authedPage: page }) => {
    await page.goto("/utility-plans");
    await page.getByTestId("add-utility-plan-button").click();

    const width = await widthOf(page, "add-utility-plan-dialog");
    expect(width).toBeGreaterThan(FORM_DIALOG_MIN_WIDE_PX);
    expect(width).toBeLessThanOrEqual(DESKTOP.width);
  });

  test("a short form stays narrow rather than inheriting the wide default", async ({
    authedPage: page,
  }) => {
    // The market-rate dialog is a handful of fields. Widening every dialog
    // would strand this one's inputs across an over-long line.
    await page.goto("/utility-plans");
    await page.getByTestId("record-market-rate-button").click();

    const width = await widthOf(page, "market-rate-benchmark-dialog");
    expect(width).toBeLessThanOrEqual(FORM_DIALOG_MAX_NARROW_PX);
  });

  test("a wide dialog still fits a phone without overflowing it", async ({
    authedPage: page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/insurance-policies");
    await page.getByRole("button", { name: "Add policy" }).click();

    await expect(panelOf(page, "add-insurance-policy-dialog")).toBeVisible();
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(390);
  });
});
