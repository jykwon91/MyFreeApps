import { test, expect, type APIRequestContext, type Page } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

/**
 * PR 1.4 — Channels (iCal sync) admin UI behavioural E2E.
 *
 * Each test creates its own seed data via the test API and tears down in
 * `finally` so we never leave artifacts in dev/prod databases (per
 * `feedback_clean_test_data`). Cascade delete on `channel_listings`
 * cleans up the child rows when the listing is hard-deleted.
 */

async function deleteListingViaTestApi(
  api: APIRequestContext, listingId: string,
): Promise<void> {
  await api.delete(`/test/listings/${listingId}`).catch(() => {});
}

async function seedListing(
  api: APIRequestContext, propertyId: string, title: string,
): Promise<string> {
  const res = await api.post("/test/seed-listing", {
    data: {
      property_id: propertyId,
      title,
      monthly_rate: "1500.00",
      room_type: "private_room",
      status: "active",
    },
  });
  if (!res.ok()) {
    throw new Error(`seedListing failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function gotoListingDetail(page: Page, listingId: string): Promise<void> {
  await page.goto(`/listings/${listingId}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("channels-section")).toBeVisible({
    timeout: 10000,
  });
}

test.describe("Listings channels (PR 1.4)", () => {
  test("user can add a channel and the outbound iCal URL is shown", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const property = await createProperty(api, {
      name: `E2E Channels Property ${runId}`,
    });
    const listingIds: string[] = [];

    try {
      const listingId = await seedListing(
        api, property.id, `E2E Channels Listing ${runId}`,
      );
      listingIds.push(listingId);

      await gotoListingDetail(page, listingId);

      // 1) Empty state visible.
      await expect(
        page.getByTestId("channels-section-empty-state"),
      ).toBeVisible();
      await expect(
        page.getByTestId("channels-section-add-cta"),
      ).toBeVisible();

      // 2) Add an Airbnb channel link.
      await page.getByTestId("channels-section-add-cta").click();
      await expect(
        page.getByTestId("channel-listing-form-modal"),
      ).toBeVisible();
      await page
        .getByTestId("channel-listing-form-channel")
        .selectOption("airbnb");
      const externalUrl = `https://airbnb.com/rooms/test-${runId}`;
      await page
        .getByTestId("channel-listing-form-external-url")
        .fill(externalUrl);
      await page.getByTestId("channel-listing-form-submit").click();

      // Modal closes and the row appears in the list.
      await expect(
        page.getByTestId("channel-listing-form-modal"),
      ).not.toBeVisible({ timeout: 10000 });
      await expect(
        page.getByTestId("channel-listings-list"),
      ).toBeVisible();

      // 3) Verify via API: the channel_listings endpoint returns the row
      //    with a fully-qualified outbound iCal URL.
      const res = await api.get(`/listings/${listingId}/channels`);
      expect(res.ok()).toBeTruthy();
      const channelListings = (await res.json()) as Array<{
        id: string;
        channel_id: string;
        external_url: string;
        ical_export_url: string;
        ical_export_token: string;
      }>;
      expect(channelListings).toHaveLength(1);
      expect(channelListings[0].channel_id).toBe("airbnb");
      expect(channelListings[0].external_url).toBe(externalUrl);
      expect(channelListings[0].ical_export_token).toBeTruthy();
      expect(channelListings[0].ical_export_url).toMatch(
        /\/api\/calendar\/[\w-]+\.ics$/,
      );

      // 4) The row in the UI shows the channel name + the Copy iCal URL button.
      const rowId = channelListings[0].id;
      await expect(
        page.getByTestId(`channel-listing-row-${rowId}`),
      ).toBeVisible();
      await expect(
        page.getByTestId(`channel-listing-copy-${rowId}`),
      ).toBeVisible();
    } finally {
      for (const id of listingIds) {
        await deleteListingViaTestApi(api, id);
      }
      await deleteProperty(api, property.id);
    }
  });
});
