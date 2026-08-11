import { test, expect, type APIRequestContext } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

/**
 * E2E for tenant occupancy on the unified calendar.
 *
 * The calendar used to read `listing_blackouts` alone, so an occupied house
 * rendered as an empty grid. Leases are now a second source. This spec seeds a
 * real tenancy alongside a channel booking on the same listing and verifies the
 * full flow end to end:
 *
 * 1. Seed property + listing + applicant + a lease on that listing, plus an
 *    Airbnb blackout on the same row
 * 2. Both bars render, and the tenancy names the tenant
 * 3. The lease band covers its final day — `SignedLease.ends_on` is INCLUSIVE
 *    while the API's `ends_on` is EXCLUSIVE, so a regression here silently
 *    renders every tenancy a day short
 * 4. Opening the tenancy shows read-only detail and links to the lease, with no
 *    notes editor or attachment uploader (those endpoints are blackout-keyed
 *    and would 404 on a lease id)
 * 5. Filtering to Tenant hides the channel booking, and vice versa
 * 6. Cleanup
 */

const FROM_ISO = "2026-06-01";
const TO_ISO = "2026-07-01";
const LEASE_STARTS_ON = "2026-06-03";
// Inclusive — the tenant's last day. The grid must still colour the 20th.
const LEASE_ENDS_ON = "2026-06-20";

interface SeedListingPayload {
  property_id: string;
  title?: string;
  status?: "active" | "paused" | "draft" | "archived";
}

async function seedListing(api: APIRequestContext, payload: SeedListingPayload): Promise<string> {
  const res = await api.post("/test/seed-listing", { data: payload });
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

async function seedLease(
  api: APIRequestContext,
  applicantId: string,
  listingId: string,
): Promise<string> {
  const res = await api.post("/test/seed-signed-lease", {
    data: {
      applicant_id: applicantId,
      listing_id: listingId,
      kind: "imported",
      status: "signed",
      starts_on: LEASE_STARTS_ON,
      ends_on: LEASE_ENDS_ON,
    },
  });
  if (!res.ok()) throw new Error(`seedLease failed: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function seedBlackout(api: APIRequestContext, listingId: string, runId: number): Promise<string | null> {
  const res = await api.post("/test/seed-blackout", {
    data: {
      listing_id: listingId,
      starts_on: "2026-06-24",
      ends_on: "2026-06-27",
      source: "airbnb",
      source_event_id: `e2e-lease-cal-${runId}`,
    },
  });
  if (!res.ok()) return null;
  const body = (await res.json()) as { id: string };
  return body.id;
}

test.describe("Tenant leases on the calendar", () => {
  test("a seeded tenancy renders beside a channel booking, reads as read-only, and filters", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const tenantName = `E2E Tenant ${runId}`;
    const property = await createProperty(api, { name: `E2E Lease Calendar ${runId}` });
    const listingId = await seedListing(api, {
      property_id: property.id,
      title: `E2E Lease Calendar Listing ${runId}`,
      status: "active",
    });
    const applicantId = await seedApplicant(api, tenantName);
    const leaseId = await seedLease(api, applicantId, listingId);
    const blackoutId = await seedBlackout(api, listingId, runId);

    test.skip(
      blackoutId === null,
      "Blackout seed endpoint not wired up — see app/test_helpers/seed.py",
    );

    try {
      // The listing-per-row timeline — the month grid is the default view.
      await page.goto(`/calendar?from=${FROM_ISO}&to=${TO_ISO}&view=timeline`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();

      // Both sources land on the same listing row.
      const bars = page.getByTestId("calendar-event-bar");
      await expect(bars).toHaveCount(2);

      const leaseBar = page.locator(
        '[data-testid="calendar-event-bar"][data-source="lease"]',
      );
      await expect(leaseBar).toHaveCount(1);
      // The band names the tenant — "Tenant" alone would say nothing the
      // colour didn't already.
      await expect(leaseBar).toContainText(tenantName);

      // Inclusive lease end → exclusive event end. If the mapper drops the
      // +1 day, this bar stops on the 19th and the aria-label says so.
      await expect(leaseBar).toHaveAttribute(
        "aria-label",
        new RegExp(`${tenantName} tenancy from ${LEASE_STARTS_ON} to 2026-06-21`),
      );

      // Detail dialog: read-only, links to the lease, offers no blackout-keyed
      // editing affordances.
      await leaseBar.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(tenantName)).toBeVisible();
      await expect(dialog.getByTestId("calendar-lease-footer")).toBeVisible();
      await expect(dialog.getByRole("link", { name: /open the lease/i })).toHaveAttribute(
        "href",
        `/leases/${leaseId}`,
      );
      await expect(dialog.getByRole("textbox")).toHaveCount(0);
      await expect(dialog.getByText("Days")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();

      // Filter to Tenant only — the channel booking drops out.
      await page.getByTestId("source-filter-trigger").click();
      await page.getByRole("menuitemcheckbox", { name: /Tenant/ }).click();
      await page.keyboard.press("Escape");
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("calendar-event-bar")).toHaveCount(1);
      await expect(page.getByTestId("calendar-event-bar")).toHaveAttribute("data-source", "lease");

      // Swap the filter to Airbnb only — the tenancy drops out. This is the
      // half that catches a service that ignores the source filter for one of
      // the two queries.
      await page.getByTestId("source-filter-trigger").click();
      await page.getByRole("menuitemcheckbox", { name: /Tenant/ }).click();
      await page.getByRole("menuitemcheckbox", { name: /Airbnb/ }).click();
      await page.keyboard.press("Escape");
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("calendar-event-bar")).toHaveCount(1);
      await expect(page.getByTestId("calendar-event-bar")).toHaveAttribute("data-source", "airbnb");
    } finally {
      if (blackoutId !== null) await api.delete(`/test/blackouts/${blackoutId}`).catch(() => {});
      await api.delete(`/test/signed-leases/${leaseId}`).catch(() => {});
      await api.delete(`/test/applicants/${applicantId}`).catch(() => {});
      await api.delete(`/test/listings/${listingId}`).catch(() => {});
      await deleteProperty(api, property.id);
    }
  });
});

// A lease with no `listing_id` used to be dropped from the calendar entirely.
// That behaviour is now a bug, not a contract — see
// `calendar-unlinked-lease.spec.ts` for the replacement coverage.
