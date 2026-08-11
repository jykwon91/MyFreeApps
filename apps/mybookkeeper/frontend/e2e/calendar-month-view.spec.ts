import { test, expect, type APIRequestContext } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

/**
 * E2E for the month view — the calendar's default shape.
 *
 * The calendar used to open on a listing-per-row timeline, which answers
 * "which room is free" but reads nothing like a calendar. The month grid is
 * now the default and the timeline lives behind a toggle. This spec walks the
 * flow a host actually performs:
 *
 * 1. Seed a property + listing + a tenancy inside a known month
 * 2. The month grid is what loads by default, with the stay drawn as a pill
 *    spanning the days it covers
 * 3. The pill opens the same detail dialog the timeline uses
 * 4. Stepping to the next month moves the grid and the URL together
 * 5. The toggle swaps to the timeline and back, and survives a reload —
 *    the view lives in the URL so a shared link opens on what was sent
 * 6. Cleanup
 */

const ANCHOR_ISO = "2026-09-01";
const LEASE_STARTS_ON = "2026-09-07";
// Inclusive — the tenant's last day. The API reports the 10th, exclusive.
const LEASE_ENDS_ON = "2026-09-09";
// The overflow case counts everything drawn on one day, so it gets a month of
// its own — the suite's specs share one organization and run in parallel, and
// a neighbour's booking landing on the same day would move the count.
const CROWDED_ANCHOR_ISO = "2026-11-01";
const CROWDED_DAY = "2026-11-10";
const CROWDED_LEASE_ENDS_ON = "2026-11-12";
const CROWDED_BLACKOUT_ENDS_ON = "2026-11-11";
const CROWDING_SOURCES = ["airbnb", "vrbo", "furnished_finder", "rotating_room", "direct"];

async function seedListing(
  api: APIRequestContext,
  propertyId: string,
  title: string,
): Promise<string> {
  const res = await api.post("/test/seed-listing", {
    data: { property_id: propertyId, title, status: "active" },
  });
  if (!res.ok()) throw new Error(`seedListing failed: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function seedApplicant(api: APIRequestContext, legalName: string): Promise<string> {
  const res = await api.post("/test/seed-applicant", {
    data: { legal_name: legalName, stage: "lead" },
  });
  if (!res.ok()) throw new Error(`seedApplicant failed: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function seedBlackout(
  api: APIRequestContext,
  listingId: string,
  source: string,
  uid: string,
): Promise<string> {
  const res = await api.post("/test/seed-blackout", {
    data: {
      listing_id: listingId,
      starts_on: CROWDED_DAY,
      // Exclusive per the iCal convention — one blocked day.
      ends_on: CROWDED_BLACKOUT_ENDS_ON,
      source,
      source_event_id: uid,
    },
  });
  if (!res.ok()) throw new Error(`seedBlackout failed: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function seedLease(
  api: APIRequestContext,
  applicantId: string,
  listingId: string,
  startsOn: string = LEASE_STARTS_ON,
  endsOn: string = LEASE_ENDS_ON,
): Promise<string> {
  const res = await api.post("/test/seed-signed-lease", {
    data: {
      applicant_id: applicantId,
      listing_id: listingId,
      kind: "imported",
      status: "signed",
      starts_on: startsOn,
      ends_on: endsOn,
    },
  });
  if (!res.ok()) throw new Error(`seedLease failed: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { id: string };
  return body.id;
}

test.describe("Calendar month view", () => {
  test("opens on the month grid, draws the stay, and toggles to the timeline", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const tenantName = `E2E Month Tenant ${runId}`;
    const property = await createProperty(api, { name: `E2E Month View ${runId}` });
    const listingId = await seedListing(api, property.id, `E2E Month Listing ${runId}`);
    const applicantId = await seedApplicant(api, tenantName);
    const leaseId = await seedLease(api, applicantId, listingId);

    try {
      // No `view` param — the month grid is the default.
      await page.goto(`/calendar?from=${ANCHOR_ISO}`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();

      const monthGrid = page.getByTestId("calendar-month-grid");
      await expect(monthGrid).toBeVisible();
      await expect(monthGrid).toHaveAttribute("data-month", "September 2026");
      await expect(page.getByTestId("calendar-grid")).toHaveCount(0);

      // Six week rows of seven days, and Sunday leads the header.
      await expect(page.getByTestId("calendar-month-week")).toHaveCount(6);
      await expect(page.getByTestId("calendar-month-day")).toHaveCount(42);
      await expect(page.getByTestId("calendar-month-weekday-header")).toContainText("Sun");

      // Columns are sevenths of the width, not fixed pixels — unlike the
      // timeline, the month grid must never push the page sideways.
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(
        bodyWidth,
        `Horizontal scroll on body in month view — bodyWidth=${bodyWidth}`,
      ).toBeLessThanOrEqual(1281);

      // The tenancy draws as one pill across the days it covers. Inclusive
      // lease end → exclusive event end, same conversion the timeline makes.
      const pill = page
        .getByTestId("calendar-month-event-pill")
        .filter({ hasText: tenantName });
      await expect(pill).toHaveCount(1);
      await expect(pill).toHaveAttribute(
        "aria-label",
        new RegExp(`${tenantName} tenancy from ${LEASE_STARTS_ON} to 2026-09-10`),
      );

      // Same detail dialog as the timeline, linking back to the lease.
      await pill.click();
      const dialog = page.getByTestId("calendar-event-detail");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(tenantName)).toBeVisible();
      await expect(dialog.getByRole("link", { name: /open the lease/i })).toHaveAttribute(
        "href",
        `/leases/${leaseId}`,
      );
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();

      // Next month moves the grid and the URL together; the stay is behind us.
      await page.getByTestId("calendar-month-next").click();
      await page.waitForLoadState("networkidle");
      await expect(monthGrid).toHaveAttribute("data-month", "October 2026");
      expect(page.url()).toContain("from=2026-10-01");
      await expect(
        page.getByTestId("calendar-month-event-pill").filter({ hasText: tenantName }),
      ).toHaveCount(0);

      await page.getByTestId("calendar-month-prev").click();
      await page.waitForLoadState("networkidle");
      await expect(monthGrid).toHaveAttribute("data-month", "September 2026");

      // Toggle to the timeline — the listing-per-row shape comes back.
      await page.getByTestId("calendar-view-timeline").click();
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("calendar-grid")).toBeVisible();
      await expect(page.getByTestId("calendar-month-grid")).toHaveCount(0);
      await expect(page.getByTestId("calendar-window-nav")).toBeVisible();
      await expect(
        page.getByTestId("calendar-event-bar").filter({ hasText: tenantName }),
      ).toHaveCount(1);

      // The view is URL state, so a reload keeps it — a link opens on the
      // shape the sender was looking at.
      expect(page.url()).toContain("view=timeline");
      await page.reload();
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("calendar-grid")).toBeVisible();

      // ...and back to the month.
      await page.getByTestId("calendar-view-month").click();
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("calendar-month-grid")).toBeVisible();
      await expect(page.getByTestId("calendar-grid")).toHaveCount(0);
    } finally {
      await api.delete(`/test/signed-leases/${leaseId}`).catch(() => {});
      await api.delete(`/test/applicants/${applicantId}`).catch(() => {});
      await api.delete(`/test/listings/${listingId}`).catch(() => {});
      await deleteProperty(api, property.id);
    }
  });

  test("surfaces bookings past the lane budget behind a clickable +N more", async ({
    authedPage: page,
    api,
  }) => {
    /**
     * A day can hold more bookings than the cell has lanes for. The ones that
     * don't fit are counted into a "+N more" button, which must sit BELOW the
     * pills and stay clickable — the pill layer is painted on top of the
     * cells, so a button that lands in a lane's band is covered by a pill and
     * the overflow becomes unreachable. That failure is invisible to jsdom
     * (no layout), which is why it is asserted here by actually clicking.
     */
    const runId = Date.now();
    const tenantName = `E2E Crowded Tenant ${runId}`;
    const property = await createProperty(api, { name: `E2E Crowded Month ${runId}` });
    const listingId = await seedListing(api, property.id, `E2E Crowded Listing ${runId}`);
    const applicantId = await seedApplicant(api, tenantName);
    const leaseId = await seedLease(
      api,
      applicantId,
      listingId,
      CROWDED_DAY,
      CROWDED_LEASE_ENDS_ON,
    );
    const blackoutIds: string[] = [];

    try {
      for (const source of CROWDING_SOURCES) {
        blackoutIds.push(await seedBlackout(api, listingId, source, `crowd-${source}-${runId}`));
      }
      // Lease + five blackouts on one day, against a four-lane budget.
      const expectedOverflow = 1 + CROWDING_SOURCES.length - 4;

      await page.goto(`/calendar?from=${CROWDED_ANCHOR_ISO}`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("calendar-month-grid")).toBeVisible();

      const day = page.locator(`[data-day="${CROWDED_DAY}"]`);
      const overflow = day.getByTestId("calendar-month-overflow");
      await expect(overflow).toHaveText(`+${expectedOverflow} more`);

      // The click is the assertion: a covered button times out here.
      await overflow.click();

      const dialog = page.getByTestId("calendar-month-day-dialog");
      await expect(dialog).toBeVisible();
      // Every booking on the day, including the ones no pill was drawn for.
      await expect(dialog.getByTestId("calendar-month-day-dialog-event")).toHaveCount(
        1 + CROWDING_SOURCES.length,
      );
      await expect(dialog.getByText(tenantName)).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    } finally {
      for (const id of blackoutIds) await api.delete(`/test/blackouts/${id}`).catch(() => {});
      await api.delete(`/test/signed-leases/${leaseId}`).catch(() => {});
      await api.delete(`/test/applicants/${applicantId}`).catch(() => {});
      await api.delete(`/test/listings/${listingId}`).catch(() => {});
      await deleteProperty(api, property.id);
    }
  });
});
