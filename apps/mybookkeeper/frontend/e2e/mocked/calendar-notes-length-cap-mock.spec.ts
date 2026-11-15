/**
 * No-backend E2E: the booking-notes box on the calendar stops typing at the
 * length the backend accepts, so an over-length note can never reach a save
 * the server would refuse (422).
 *
 * Runs under playwright.layout.config.ts with the API fully mocked.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { plantAuth } from "./fixtures/mockSession";
import { BLACKOUT_ID, stubCalendar } from "./fixtures/mockCalendar";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { CALENDAR_NOTES_MAX_LENGTH } from "@mybookkeeper/api-client/constants/calendarNotes";

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page, { answer: "empty" });
});

test.describe("Calendar booking notes length cap (mocked, no backend)", () => {
  test("notes stop at the backend's limit and the save never exceeds it", async ({ page }) => {
    const patchBodies: Array<Record<string, unknown>> = [];
    await page.setViewportSize({ width: 1280, height: 900 });
    await plantAuth(page);
    await stubCalendar(page, patchBodies);

    await page.goto("/calendar?from=2026-06-01&to=2026-07-01&view=timeline");
    await page.locator(`[data-testid="calendar-event-bar"][data-event-id="${BLACKOUT_ID}"]`).click();
    await expect(page.getByTestId("calendar-event-detail")).toBeVisible({ timeout: 10000 });

    const textarea = page.getByTestId("blackout-notes-textarea");
    await textarea.fill("x".repeat(CALENDAR_NOTES_MAX_LENGTH + 5));
    await expect(textarea).toHaveValue("x".repeat(CALENDAR_NOTES_MAX_LENGTH));

    await textarea.blur();
    await expect.poll(() => patchBodies.length).toBeGreaterThan(0);
    for (const body of patchBodies) {
      expect((body.host_notes as string).length).toBeLessThanOrEqual(CALENDAR_NOTES_MAX_LENGTH);
    }
  });
});
