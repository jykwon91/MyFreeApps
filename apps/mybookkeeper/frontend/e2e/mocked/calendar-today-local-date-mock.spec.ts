/**
 * No-backend E2E: "today" on the calendar is the host's own date. On a US
 * evening UTC has already moved on to tomorrow, which used to highlight the
 * wrong day and, on the last evening of a month, open the next month.
 *
 * Runs under playwright.layout.config.ts with the API fully mocked.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

// 8pm on Nov 14 in Chicago is 2am on Nov 15 in UTC.
const NOV_14_EVENING = new Date("2026-11-15T02:00:00Z");
// 9:30pm on Oct 31 in Chicago is 2:30am on Nov 1 in UTC. In the past, so the
// planted session (which expires relative to the real clock) is still valid.
const OCT_31_EVENING = new Date("2026-11-01T02:30:00Z");

test.use({ timezoneId: "America/Chicago" });

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page, { answer: "empty" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await plantAuth(page);
  await stubCalendar(page);
});

async function stubCalendar(page: Page): Promise<void> {
  await stubWorkspaceShell(page, "owner");
  await page.route("**/api/properties", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
  );
  await page.route("**/api/listings?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 1, has_more: false }),
    }),
  );
  await page.route("**/api/calendar/events**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "00000000-0000-0000-0000-0000000000b1",
          listing_id: "00000000-0000-0000-0000-0000000000c1",
          listing_name: "Lakeview Room",
          property_id: "00000000-0000-0000-0000-0000000000d1",
          property_name: "Lakeview House",
          starts_on: "2026-11-10",
          ends_on: "2026-11-12",
          source: "airbnb",
          source_event_id: "mock-1",
          summary: "Reserved",
          host_notes: null,
          attachment_count: 0,
          updated_at: "2026-11-01T00:00:00Z",
        },
      ]),
    }),
  );
}

test.describe("Calendar today uses the host's date (mocked, no backend)", () => {
  test("highlights today, not tomorrow, on a US evening", async ({ page }) => {
    await page.clock.setFixedTime(NOV_14_EVENING);
    await page.goto("/calendar");

    const today = page.locator('[data-testid="calendar-month-day"][data-today="true"]');
    await expect(today).toHaveCount(1);
    await expect(today).toHaveAttribute("data-day", "2026-11-14");
    await expect(page.getByTestId("calendar-month-jumper")).toHaveText("November 2026");
  });

  test("Today brings the month view back to this month on its last evening", async ({ page }) => {
    await page.clock.setFixedTime(OCT_31_EVENING);
    await page.goto("/calendar?from=2026-06-01");
    await expect(page.getByTestId("calendar-month-jumper")).toHaveText("June 2026");

    await page.getByTestId("calendar-month-today").click();

    await expect(page.getByTestId("calendar-month-jumper")).toHaveText("October 2026");
    await expect(page).toHaveURL(/from=2026-10-01/);
    const today = page.locator('[data-testid="calendar-month-day"][data-today="true"]');
    await expect(today).toHaveAttribute("data-day", "2026-10-31");
  });

  test("Jump to today starts the timeline on today", async ({ page }) => {
    await page.clock.setFixedTime(NOV_14_EVENING);
    await page.goto("/calendar?from=2026-06-01&to=2026-07-01&view=timeline");

    await page.getByTestId("calendar-today").click();

    await expect(page).toHaveURL(/from=2026-11-14/);
  });
});
