/**
 * No-backend E2E for what a workspace viewer can do on /listings and a listing's page.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies:
 *   - A viewer opens a listing from the list, is told it's view only, and gets none
 *     of the controls the server would refuse (New listing, Edit, Delete, link and
 *     channel changes, photo upload, reorder and delete). They can still open,
 *     select and download photos and copy the iCal URL, and no write request leaves
 *     the page.
 *   - An owner still gets those controls, so the viewer check can't pass by accident.
 *   - The viewer's page, with the photo toolbar open, has no sideways scroll on a phone.
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import type { OrgRole } from "@mybookkeeper/api-client/types/organization/OrgRole";
import { json } from "@platform/ui/test-support/mockResponse";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { LISTING, LISTING_ID, LISTING_SUMMARY } from "./fixtures/mockListing";
import { LISTING_MESSAGES } from "../../src/shared/lib/listing-messages";

const CHANNEL_LISTING = {
  id: "cl-1",
  listing_id: LISTING_ID,
  channel_id: "airbnb",
  channel: {
    id: "airbnb", name: "Airbnb", supports_ical_export: true, supports_ical_import: true,
    created_at: "2026-01-01T00:00:00Z",
  },
  external_url: "https://airbnb.com/rooms/12345",
  external_id: "12345",
  ical_import_url: null,
  last_imported_at: null,
  last_import_error: null,
  ical_export_token: "token-xyz",
  ical_export_url: "https://example.com/api/calendar/token-xyz.ics",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

/** Answers the pages' reads and records every write, which a viewer must never send. */
async function stubApi(page: Page, orgRole: OrgRole): Promise<string[]> {
  const writes: string[] = [];
  // Registered first so the specific routes below win; the page's other reads get an empty answer.
  await page.route("**/api/**", (route, request: Request) => {
    if (request.method() !== "GET") writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    return route.fulfill(json(request.method() === "GET" ? [] : {}));
  });
  await stubWorkspaceShell(page, orgRole);
  await page.route(/\/api\/listings(\?.*)?$/, (route, request: Request) =>
    request.method() === "GET"
      ? route.fulfill(json({ items: [LISTING_SUMMARY], total: 1, has_more: false }))
      : route.fallback(),
  );
  await page.route(`**/api/listings/${LISTING_ID}`, (route, request: Request) =>
    request.method() === "GET" ? route.fulfill(json(LISTING)) : route.fallback(),
  );
  // Two channels with one linked, so the Add channel button has a reason to show.
  await page.route("**/api/channels", (route) =>
    route.fulfill(json([CHANNEL_LISTING.channel, { ...CHANNEL_LISTING.channel, id: "vrbo", name: "VRBO" }])),
  );
  await page.route(`**/api/listings/${LISTING_ID}/channels`, (route, request: Request) =>
    request.method() === "GET" ? route.fulfill(json([CHANNEL_LISTING])) : route.fallback(),
  );
  return writes;
}

async function openListingFromList(page: Page): Promise<void> {
  await page.goto("/listings");
  await page.getByText("Garage Suite A").locator("visible=true").first().click();
  await expect(page.getByRole("heading", { name: "Garage Suite A" })).toBeVisible();
}

test.describe("Listings for a viewer", () => {
  test("says it's view only and offers nothing the server would refuse", async ({ page }) => {
    await plantAuth(page);
    const writes = await stubApi(page, "viewer");

    await page.goto("/listings");
    await expect(page.getByText("Garage Suite A").locator("visible=true").first()).toBeVisible();
    await expect(page.getByTestId("new-listing-button")).toHaveCount(0);

    await openListingFromList(page);
    await expect(page.getByRole("note")).toHaveText(LISTING_MESSAGES.viewOnlyNote);
    await expect(page.getByTestId("edit-listing-button")).toHaveCount(0);
    await expect(page.getByTestId("delete-listing-button")).toHaveCount(0);

    await expect(page.getByText("FF-12345")).toBeVisible();
    await expect(page.getByTestId("external-id-add-button")).toHaveCount(0);
    await expect(page.getByTestId("channel-listing-row-cl-1")).toBeVisible();
    await expect(page.getByTestId("channel-listing-copy-cl-1")).toBeVisible();
    await expect(page.getByTestId("channels-section-add-button")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^(Edit|Remove)\b/ })).toHaveCount(0);

    await expect(page.getByTestId("listing-photo-upload-button")).toHaveCount(0);
    await expect(page.getByTestId("listing-photo-drag-handle")).toHaveCount(0);
    await expect(page.getByTestId("listing-photo-delete-button")).toHaveCount(0);
    await page.getByTestId("listing-photo-checkbox").check();
    await expect(page.getByTestId("photo-bulk-download-button")).toBeVisible();
    await expect(page.getByTestId("photo-bulk-delete-button")).toHaveCount(0);

    await page.getByRole("button", { name: "View photo 1 full size" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    expect(writes).toEqual([]);
  });

  test("fits a phone screen without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await plantAuth(page);
    await stubApi(page, "viewer");
    await openListingFromList(page);
    await page.getByTestId("listing-photo-checkbox").check();
    await expect(page.getByTestId("photo-selection-toolbar")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("Listings for an owner", () => {
  test("still offers the controls a viewer doesn't get", async ({ page }) => {
    await plantAuth(page);
    await stubApi(page, "owner");

    await page.goto("/listings");
    await expect(page.getByTestId("new-listing-button")).toBeVisible();

    await openListingFromList(page);
    await expect(page.getByRole("note")).toHaveCount(0);
    await expect(page.getByTestId("edit-listing-button")).toBeVisible();
    await expect(page.getByTestId("delete-listing-button")).toBeVisible();
    await expect(page.getByTestId("external-id-add-button")).toBeVisible();
    await expect(page.getByTestId("channel-listing-edit-cl-1")).toBeVisible();
    await expect(page.getByTestId("channels-section-add-button")).toBeVisible();
    await expect(page.getByTestId("listing-photo-upload-button")).toBeVisible();
    await expect(page.getByTestId("listing-photo-drag-handle")).toBeVisible();
    await page.getByTestId("listing-photo-checkbox").check();
    await expect(page.getByTestId("photo-bulk-delete-button")).toBeVisible();
  });
});
