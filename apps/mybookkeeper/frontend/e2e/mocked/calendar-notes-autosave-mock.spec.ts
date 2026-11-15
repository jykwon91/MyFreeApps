/**
 * No-backend E2E: the calendar booking-notes box keeps the cursor while its
 * autosave runs, and never saves text the server already has.
 *
 * Runs under playwright.layout.config.ts with the API fully mocked.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth } from "./fixtures/mockSession";
import { BLACKOUT_ID, stubCalendar } from "./fixtures/mockCalendar";

const SAVE_RESPONSE_DELAY_MS = 1500;

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page, { answer: "empty" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await plantAuth(page);
});

async function openNotes(page: Page) {
  await page.goto("/calendar?from=2026-06-01&to=2026-07-01&view=timeline");
  await page.locator(`[data-testid="calendar-event-bar"][data-event-id="${BLACKOUT_ID}"]`).click();
  await expect(page.getByTestId("calendar-event-detail")).toBeVisible({ timeout: 10000 });
  return page.getByTestId("blackout-notes-textarea");
}

test.describe("Calendar booking notes autosave (mocked, no backend)", () => {
  test("typing continues, focused, while the autosave is in flight", async ({ page }) => {
    const patchBodies: Array<Record<string, unknown>> = [];
    await stubCalendar(page, patchBodies, SAVE_RESPONSE_DELAY_MS);
    const textarea = await openNotes(page);

    await textarea.click();
    await page.keyboard.type("Guest Alice");
    await expect.poll(() => patchBodies.length).toBe(1);
    await expect(page.getByLabel("Saving")).toBeVisible();
    await expect(textarea).toBeEnabled();
    await expect(textarea).toBeFocused();

    await page.keyboard.type(" arrives late");
    await expect(textarea).toHaveValue("Guest Alice arrives late");
    await expect(textarea).toBeFocused();
  });

  test("clicking in and out without an edit sends nothing", async ({ page }) => {
    const patchBodies: Array<Record<string, unknown>> = [];
    await stubCalendar(page, patchBodies);
    const textarea = await openNotes(page);

    await textarea.click();
    await textarea.blur();
    await page.waitForTimeout(1500);
    expect(patchBodies).toHaveLength(0);
  });

  test("one edit is saved once even when the field is blurred after the autosave", async ({ page }) => {
    const patchBodies: Array<Record<string, unknown>> = [];
    await stubCalendar(page, patchBodies);
    const textarea = await openNotes(page);

    await textarea.fill("Confirmation ABC123");
    await expect.poll(() => patchBodies.length).toBe(1);
    await textarea.blur();
    await page.waitForTimeout(1500);
    expect(patchBodies).toEqual([{ host_notes: "Confirmation ABC123" }]);
  });
});
