import { test, expect, type APIRequestContext } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

/**
 * E2E for tenancies the host never linked to a listing.
 *
 * `signed_leases.listing_id` is nullable (`ondelete="SET NULL"`), and the
 * calendar's lease query used to INNER JOIN `listings`. Every unlinked lease
 * was therefore dropped from the response with no error and no empty state —
 * the host saw a calendar missing tenants they knew they had. Two of the
 * operator's four real leases were invisible for exactly this reason.
 *
 * The query is now an outer join scoped on `signed_leases.organization_id`,
 * and unlinked tenancies collect into their own row at the end of the grid.
 * This spec walks the whole flow:
 *
 * 1. Seed a linked lease and an unlinked lease in the same window
 * 2. Both bars render — the unlinked one is not silently swallowed
 * 3. The unlinked tenancy sits on its own row, labelled as a gap to fill,
 *    below every row that does have a listing
 * 4. Its detail dialog opens and names the missing link instead of printing
 *    "null · null"
 * 5. Narrowing to a specific property still excludes it — the host asked for
 *    one property's occupancy and an unlinked lease is not part of that
 * 6. Cleanup
 */

const FROM_ISO = "2026-09-01";
const TO_ISO = "2026-10-01";
const LEASE_STARTS_ON = "2026-09-03";
// Inclusive — the tenant's last day.
const LEASE_ENDS_ON = "2026-09-20";

const UNASSIGNED_LISTING_LABEL = "No listing linked";
const UNASSIGNED_PROPERTY_LABEL = "Not linked to a property";

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

/** `listingId === null` seeds the case this spec exists for. */
async function seedLease(
  api: APIRequestContext,
  applicantId: string,
  listingId: string | null,
): Promise<string> {
  const res = await api.post("/test/seed-signed-lease", {
    data: {
      applicant_id: applicantId,
      listing_id: listingId,
      kind: "generated",
      status: "signed",
      starts_on: LEASE_STARTS_ON,
      ends_on: LEASE_ENDS_ON,
    },
  });
  if (!res.ok()) throw new Error(`seedLease failed: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { id: string };
  return body.id;
}

test.describe("Tenancies with no listing linked", () => {
  test("an unlinked lease reaches the calendar on its own row and opens", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const linkedTenant = `E2E Linked Tenant ${runId}`;
    const unlinkedTenant = `E2E Unlinked Tenant ${runId}`;

    const property = await createProperty(api, { name: `E2E Unlinked Lease ${runId}` });
    const listingId = await seedListing(api, property.id, `E2E Unlinked Listing ${runId}`);
    const linkedApplicantId = await seedApplicant(api, linkedTenant);
    const unlinkedApplicantId = await seedApplicant(api, unlinkedTenant);
    const linkedLeaseId = await seedLease(api, linkedApplicantId, listingId);
    const unlinkedLeaseId = await seedLease(api, unlinkedApplicantId, null);

    try {
      // The API is the layer the bug lived in — assert it before the DOM so a
      // failure points at the repository rather than at rendering.
      const res = await api.get(
        `/calendar/events?from=${FROM_ISO}&to=${TO_ISO}&sources=lease`,
      );
      expect(res.ok()).toBe(true);
      const events = (await res.json()) as {
        id: string;
        summary: string | null;
        listing_id: string | null;
      }[];
      const unlinkedEvent = events.find((e) => e.summary === unlinkedTenant);
      expect(unlinkedEvent, "the unlinked tenancy must survive the query").toBeDefined();
      expect(unlinkedEvent?.listing_id).toBeNull();

      // The unassigned row is a timeline concept — the month grid stacks
      // every listing into one cell, so it has no row to belong to.
      await page.goto(`/calendar?from=${FROM_ISO}&to=${TO_ISO}&view=timeline`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();

      // Both tenancies draw. The unlinked one is the regression.
      const linkedBar = page
        .getByTestId("calendar-event-bar")
        .filter({ hasText: linkedTenant });
      const unlinkedBar = page
        .getByTestId("calendar-event-bar")
        .filter({ hasText: unlinkedTenant });
      await expect(linkedBar).toHaveCount(1);
      await expect(unlinkedBar).toHaveCount(1);
      // Inclusive lease end → exclusive event end, same as a linked lease.
      await expect(unlinkedBar).toHaveAttribute(
        "aria-label",
        new RegExp(`${unlinkedTenant} tenancy from ${LEASE_STARTS_ON} to 2026-09-21`),
      );

      // It sits on the unassigned row, labelled as a gap rather than a room.
      const unassignedRow = page.locator(
        '[data-testid="calendar-listing-row"][data-unassigned="true"]',
      );
      await expect(unassignedRow).toHaveCount(1);
      await expect(unassignedRow).toContainText(UNASSIGNED_LISTING_LABEL);
      await expect(unassignedRow).toContainText(UNASSIGNED_PROPERTY_LABEL);
      await expect(unassignedRow.getByText(unlinkedTenant)).toBeVisible();

      // ...and below everything that does have a listing, so the grid still
      // reads property-first.
      const rowIds = await page
        .getByTestId("calendar-listing-row")
        .evaluateAll((rows) =>
          rows.map((row) => (row as HTMLElement).dataset.listingId ?? ""),
        );
      expect(rowIds.indexOf("unassigned")).toBe(rowIds.length - 1);
      expect(rowIds.indexOf(listingId)).toBeLessThan(rowIds.indexOf("unassigned"));

      // Detail dialog names the missing link instead of rendering "null · null".
      await unlinkedBar.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(unlinkedTenant)).toBeVisible();
      await expect(dialog.getByText(UNASSIGNED_LISTING_LABEL)).toBeVisible();
      await expect(dialog.getByRole("link", { name: /open the lease/i })).toHaveAttribute(
        "href",
        `/leases/${unlinkedLeaseId}`,
      );
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();

      // Narrowing to the property answers "this property's occupancy", which
      // an unlinked lease is not part of. The linked tenancy survives.
      await page.goto(
        `/calendar?from=${FROM_ISO}&to=${TO_ISO}&view=timeline&properties=${property.id}`,
      );
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByTestId("calendar-event-bar").filter({ hasText: linkedTenant }),
      ).toHaveCount(1);
      await expect(
        page.getByTestId("calendar-event-bar").filter({ hasText: unlinkedTenant }),
      ).toHaveCount(0);
      await expect(
        page.locator('[data-testid="calendar-listing-row"][data-unassigned="true"]'),
      ).toHaveCount(0);
    } finally {
      await api.delete(`/test/signed-leases/${unlinkedLeaseId}`).catch(() => {});
      await api.delete(`/test/signed-leases/${linkedLeaseId}`).catch(() => {});
      await api.delete(`/test/applicants/${unlinkedApplicantId}`).catch(() => {});
      await api.delete(`/test/applicants/${linkedApplicantId}`).catch(() => {});
      await api.delete(`/test/listings/${listingId}`).catch(() => {});
      await deleteProperty(api, property.id);
    }
  });
});
