/**
 * No-backend E2E: the booking-notes box on the calendar stops typing at the
 * length the backend accepts, so an over-length note can never reach a save
 * the server would refuse (422).
 *
 * Runs under playwright.layout.config.ts with the API fully mocked.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { CALENDAR_NOTES_MAX_LENGTH } from "@mybookkeeper/api-client/constants/calendarNotes";

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page, { answer: "empty" });
});

const BLACKOUT_ID = "00000000-0000-0000-0000-0000000000b1";
const LISTING_ID = "00000000-0000-0000-0000-0000000000c1";
const PROPERTY_ID = "00000000-0000-0000-0000-0000000000d1";
const STAMP = "2026-06-01T00:00:00Z";

async function stubCalendar(page: Page, patchBodies: Array<Record<string, unknown>>): Promise<void> {
  await stubWorkspaceShell(page, "owner");
  await page.route("**/api/properties", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
  );
  await page.route("**/api/listings?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0, has_more: false }),
    }),
  );
  await page.route("**/api/calendar/events**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: BLACKOUT_ID,
          listing_id: LISTING_ID,
          listing_name: "Lakeview Room",
          property_id: PROPERTY_ID,
          property_name: "Lakeview House",
          starts_on: "2026-06-05",
          ends_on: "2026-06-10",
          source: "airbnb",
          source_event_id: "mock-1",
          summary: "Reserved",
          host_notes: null,
          attachment_count: 0,
          updated_at: STAMP,
        },
      ]),
    }),
  );
  await page.route(`**/api/listings/blackouts/${BLACKOUT_ID}`, async (route, request) => {
    if (request.method() !== "PATCH") {
      await route.fallback();
      return;
    }
    const body = request.postDataJSON() as Record<string, unknown>;
    patchBodies.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: BLACKOUT_ID, host_notes: body.host_notes ?? null }),
    });
  });
}

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
