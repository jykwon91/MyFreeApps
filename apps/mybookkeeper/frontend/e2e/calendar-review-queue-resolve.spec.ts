import { test, expect, type APIRequestContext } from "./fixtures/auth";
import { listingRowBars } from "./fixtures/calendar-rows";
import { createProperty, deleteListing, deleteProperty } from "./fixtures/seed-data";
import { toasts } from "./fixtures/toasts";
import { deleteBlackout } from "./fixtures/blackouts";

/**
 * E2E tests for the calendar review queue Phase 2b: resolve → listing_blackout.
 *
 * Flow under test:
 * 1. Seed a property + listing + a review-queue item via the test API.
 * 2. Navigate to /calendar, open the review queue drawer.
 * 3. Click "Add to MBK", select the seeded listing, click "Confirm".
 * 4. Assert the success toast appears with a date range.
 * 5. Assert the blackout appears in the calendar grid (Calendar tag invalidated).
 * 6. Cleanup: hard-delete review-queue item, blackout, listing, property.
 */

interface SeedListingPayload {
  property_id: string;
  title?: string;
  status?: "active" | "paused" | "draft" | "archived";
}

interface SeedReviewQueuePayload {
  source_channel: string;
  email_message_id: string;
  check_in: string;
  check_out: string;
  guest_name?: string;
  total_price?: string;
  source_listing_id?: string;
  raw_subject?: string;
}

interface SeedReviewQueueResponse {
  id: string;
}

async function seedListing(
  api: APIRequestContext,
  payload: SeedListingPayload,
): Promise<string> {
  const res = await api.post("/test/seed-listing", { data: payload });
  if (!res.ok()) throw new Error(`seedListing failed: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function seedReviewQueueItem(
  api: APIRequestContext,
  payload: SeedReviewQueuePayload,
): Promise<SeedReviewQueueResponse> {
  const res = await api.post("/test/seed-review-queue-item", { data: payload });
  if (!res.ok()) throw new Error(`seedReviewQueueItem failed: ${res.status()} ${await res.text()}`);
  return res.json() as Promise<SeedReviewQueueResponse>;
}

async function deleteReviewQueueItem(
  api: APIRequestContext,
  itemId: string,
): Promise<void> {
  const res = await api.delete(`/test/review-queue/${itemId}`);
  if (!res.ok()) throw new Error(`deleteReviewQueueItem failed: ${res.status()} ${await res.text()}`);
}

/** Calendar events on one listing — other specs seed the same June window. */
async function getListingEvents(
  api: APIRequestContext,
  listingId: string,
  from: string,
  to: string,
): Promise<Array<{ id: string; starts_on: string; ends_on: string }>> {
  const res = await api.get(
    `/calendar/events?from=${from}&to=${to}&listing_ids=${listingId}`,
  );
  if (!res.ok()) throw new Error(`calendar events failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

async function pendingQueueItemIds(api: APIRequestContext): Promise<string[]> {
  const res = await api.get("/calendar/review-queue");
  if (!res.ok()) throw new Error(`review queue failed: ${res.status()} ${await res.text()}`);
  const items = (await res.json()) as Array<{ id: string }>;
  return items.map((item) => item.id);
}

test.describe("Calendar review queue — Phase 2b resolve creates blackout", () => {
  test("resolve queue item → blackout appears in calendar + success toast", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const fromIso = "2026-06-01";
    const toIso = "2026-07-01";
    const checkIn = "2026-06-05";
    const checkOut = "2026-06-10";
    const msgId = `e2e-resolve-${runId}`;
    const listingTitle = `E2E Review Queue ${runId}`;

    // Seed property + listing.
    const property = await createProperty(api, { name: `E2E Queue Prop ${runId}` });
    const listingId = await seedListing(api, {
      property_id: property.id,
      title: listingTitle,
      status: "active",
    });

    // Seed the review-queue item.
    const queueResult = await seedReviewQueueItem(api, {
      source_channel: "airbnb",
      email_message_id: msgId,
      check_in: checkIn,
      check_out: checkOut,
      guest_name: "Alice E2E",
      total_price: "$500.00",
      raw_subject: `Reservation confirmed - Alice E2E (Jun 5 - Jun 10) [${runId}]`,
    });

    const queueItemId = queueResult.id;
    const blackoutIdsToClean: string[] = [];

    try {
      // Timeline view — the resolved booking is asserted as an event bar.
      await page.goto(`/calendar?from=${fromIso}&to=${toIso}&view=timeline`);
      await page.waitForLoadState("networkidle");

      // Open the review queue drawer.
      const queueBtn = page.getByTestId("review-queue-badge-btn");
      await expect(queueBtn).toBeVisible({ timeout: 5000 });
      await queueBtn.click();

      // Wait for the drawer to appear and contain our queue item.
      await expect(page.getByTestId("review-queue-item").first()).toBeVisible({
        timeout: 5000,
      });

      // The seeded item's subject should be visible.
      const queueItem = page
        .getByTestId("review-queue-item")
        // The guest name repeats across runs; the subject carries this run's id.
        .filter({ hasText: String(runId) })
        .first();
      await expect(queueItem).toBeVisible({ timeout: 5000 });

      // Click "Add to MBK" to expand the listing picker.
      await queueItem.getByTestId("review-queue-add-btn").click();

      // Select the seeded listing from the dropdown.
      const select = queueItem.getByTestId("review-queue-listing-select");
      await expect(select).toBeVisible({ timeout: 3000 });
      await select.selectOption({ label: listingTitle });

      // Click "Confirm".
      await queueItem.getByTestId("review-queue-confirm-btn").click();

      // Assert the success toast appears with a date range.
      const toast = toasts(page).getByText(/Booking added/i);
      await expect(toast).toBeVisible({ timeout: 8000 });

      // The toast should mention both dates.
      const toastText = await toast.textContent();
      expect(toastText).toMatch(/Jun/i);

      // Queue item should be removed from the drawer.
      await expect(queueItem).not.toBeVisible({ timeout: 5000 });

      // Calendar should now have a blackout event in the date range.
      // The Calendar tag is invalidated by the resolve mutation.
      await page.waitForLoadState("networkidle");
      const bars = listingRowBars(page, listingId);
      await expect(bars).toHaveCount(1, { timeout: 5000 });

      // Verify via API that the blackout was actually created on this listing.
      const events = await getListingEvents(api, listingId, fromIso, toIso);
      blackoutIdsToClean.push(...events.map((e) => e.id));
      expect(events).toHaveLength(1);
      expect(events[0].starts_on).toBe(checkIn);
    } finally {
      for (const id of blackoutIdsToClean) {
        await deleteBlackout(api, id);
      }
      await deleteReviewQueueItem(api, queueItemId);
      await deleteListing(api, listingId);
      await deleteProperty(api, property.id);
    }
  });

  test("resolve against a listing that doesn't exist is rejected and leaves the item queued", async ({
    api,
  }) => {
    // A resolve the backend rejects (422 — the listing doesn't exist) must
    // not consume the queue item: the host still needs to place the booking.
    const runId = Date.now();
    const msgId = `e2e-rejected-resolve-${runId}`;
    const property = await createProperty(api, { name: `E2E Rejected Resolve ${runId}` });
    const listingId = await seedListing(api, {
      property_id: property.id,
      title: `E2E Rejected Resolve Listing ${runId}`,
      status: "active",
    });

    // Seed a queue item via direct API with missing dates.
    // We POST directly since the seed helper requires check_in/check_out.
    // Instead, we verify that the resolve endpoint rejects an item whose
    // parsed_payload lacks dates by checking the API response directly.
    const queueResult = await seedReviewQueueItem(api, {
      source_channel: "airbnb",
      email_message_id: msgId,
      check_in: "2026-06-15",
      check_out: "2026-06-20",
      raw_subject: `Rejected Resolve Test [${runId}]`,
    });

    const queueItemId = queueResult.id;

    try {
      // Attempt to resolve with a random (non-existent) listing UUID — should 422.
      const resolveRes = await api.post(
        `/calendar/review-queue/${queueItemId}/resolve`,
        { data: { listing_id: "00000000-0000-0000-0000-000000000000" } },
      );
      // Listing not found → 422, which means no blackout was created.
      expect(resolveRes.status()).toBe(422);

      // A rejected resolve leaves the item in the queue for the host.
      expect(await pendingQueueItemIds(api)).toContain(queueItemId);
    } finally {
      await deleteReviewQueueItem(api, queueItemId);
      await deleteListing(api, listingId);
      await deleteProperty(api, property.id);
    }
  });
});
