import type { Page } from "@playwright/test";
import { stubWorkspaceShell } from "./mockSession";

export const BLACKOUT_ID = "00000000-0000-0000-0000-0000000000b1";
const LISTING_ID = "00000000-0000-0000-0000-0000000000c1";
const PROPERTY_ID = "00000000-0000-0000-0000-0000000000d1";
const STAMP = "2026-06-01T00:00:00Z";

/** Stubs the calendar with one booking; every PATCH to it is recorded in patchBodies. A delay holds the PATCH response. */
export async function stubCalendar(
  page: Page,
  patchBodies: Array<Record<string, unknown>>,
  patchDelayMs = 0,
): Promise<void> {
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
    if (patchDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, patchDelayMs));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: BLACKOUT_ID, host_notes: body.host_notes ?? null }),
    });
  });
}
