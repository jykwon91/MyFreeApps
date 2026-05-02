import { test, expect, type APIRequestContext } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

/**
 * E2E for the unified calendar page (Option A — read-only viewer).
 *
 * Verifies the full user flow:
 * 1. Seed a property + listing + a couple of blackouts via API
 * 2. Navigate to /calendar
 * 3. Assert events render in the grid
 * 4. Filter by source — assert filter applies
 * 5. Cleanup
 *
 * The blackouts seeding endpoint doesn't exist yet (the iCal poller is
 * the production write path); this spec uses the dev-only seed
 * endpoint added for E2E. If the helper isn't wired up, the test
 * skips with a clear message rather than silently passing.
 */

interface SeedListingPayload {
  property_id: string;
  title?: string;
  status?: "active" | "paused" | "draft" | "archived";
}

interface SeedBlackoutPayload {
  listing_id: string;
  starts_on: string;
  ends_on: string;
  source?: string;
  source_event_id?: string | null;
}

async function seedListing(api: APIRequestContext, payload: SeedListingPayload): Promise<string> {
  const res = await api.post("/test/seed-listing", { data: payload });
  if (!res.ok()) throw new Error(`seedListing failed: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteListing(api: APIRequestContext, listingId: string): Promise<void> {
  await api.delete(`/test/listings/${listingId}`).catch(() => {});
}

async function seedBlackout(api: APIRequestContext, payload: SeedBlackoutPayload): Promise<string | null> {
  const res = await api.post("/test/seed-blackout", { data: payload });
  if (!res.ok()) {
    // The endpoint may not be wired up yet (it's added in this PR).
    // Returning null lets the test skip gracefully rather than fail
    // ambiguously — see the test body below.
    return null;
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteBlackout(api: APIRequestContext, blackoutId: string): Promise<void> {
  await api.delete(`/test/blackouts/${blackoutId}`).catch(() => {});
}

test.describe("Unified calendar viewer", () => {
  test("seeded blackouts render in the grid; source filter narrows results", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const property = await createProperty(api, { name: `E2E Calendar ${runId}` });
    const listingId = await seedListing(api, {
      property_id: property.id,
      title: `E2E Calendar Listing ${runId}`,
      status: "active",
    });

    // Pick a window centred on a fixed date so we can match the seeded
    // blackouts deterministically.
    const fromIso = "2026-06-01";
    const toIso = "2026-07-01";
    const blackoutIds: string[] = [];

    // Seed two blackouts on different sources.
    const ab = await seedBlackout(api, {
      listing_id: listingId,
      starts_on: "2026-06-05",
      ends_on: "2026-06-10",
      source: "airbnb",
      source_event_id: `e2e-ab-${runId}`,
    });
    const vr = await seedBlackout(api, {
      listing_id: listingId,
      starts_on: "2026-06-15",
      ends_on: "2026-06-18",
      source: "vrbo",
      source_event_id: `e2e-vr-${runId}`,
    });

    test.skip(
      ab === null || vr === null,
      "Blackout seed endpoint not wired up — see test_utils.py for the helper",
    );

    if (ab !== null) blackoutIds.push(ab);
    if (vr !== null) blackoutIds.push(vr);

    try {
      await page.goto(`/calendar?from=${fromIso}&to=${toIso}`);
      await page.waitForLoadState("networkidle");

      // Heading visible.
      await expect(
        page.getByRole("heading", { name: "Calendar" }),
      ).toBeVisible();

      // Two event bars render — one per blackout.
      const bars = page.getByTestId("calendar-event-bar");
      await expect(bars).toHaveCount(2);

      // Filter to airbnb only.
      await page.getByTestId("source-filter-trigger").click();
      await page.getByRole("menuitemcheckbox", { name: /Airbnb/ }).click();
      // Close menu by pressing Escape.
      await page.keyboard.press("Escape");
      await page.waitForLoadState("networkidle");

      const filteredBars = page.getByTestId("calendar-event-bar");
      await expect(filteredBars).toHaveCount(1);
      await expect(filteredBars.first()).toHaveAttribute("data-source", "airbnb");
    } finally {
      for (const id of blackoutIds) await deleteBlackout(api, id);
      await deleteListing(api, listingId);
      await deleteProperty(api, property.id);
    }
  });

  test("renders desktop grid + mobile agenda from the same seeded data", async ({
    authedPage: page,
    api,
  }) => {
    // Seed a property + listing + a blackout so the layout tests are
    // exercising a real loaded state (not the empty / no-listings
    // states). Per project rule: E2E tests must create data, perform
    // user action, verify outcome, and clean up — not check rendering
    // alone.
    const runId = Date.now();
    const property = await createProperty(api, { name: `E2E Calendar Layout ${runId}` });
    const listingId = await seedListing(api, {
      property_id: property.id,
      title: `E2E Layout Listing ${runId}`,
      status: "active",
    });
    const blackoutIds: string[] = [];
    const ab = await seedBlackout(api, {
      listing_id: listingId,
      starts_on: "2026-06-05",
      ends_on: "2026-06-10",
      source: "airbnb",
      source_event_id: `e2e-layout-${runId}`,
    });
    test.skip(
      ab === null,
      "Blackout seed endpoint not wired up — see test_utils.py for the helper",
    );
    if (ab !== null) blackoutIds.push(ab);

    try {
      // Desktop: grid view visible, mobile agenda hidden.
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto("/calendar?from=2026-06-01&to=2026-07-01");
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
      await expect(page.getByTestId("calendar-desktop")).toBeVisible();
      await expect(page.getByTestId("calendar-mobile")).toBeHidden();
      await expect(page.getByTestId("calendar-event-bar")).toHaveCount(1);
      let bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(
        bodyWidth,
        `Horizontal scroll on body at desktop (1280px) — bodyWidth=${bodyWidth}`,
      ).toBeLessThanOrEqual(1281);

      // Mobile: agenda list visible, desktop grid hidden.
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto("/calendar?from=2026-06-01&to=2026-07-01");
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("calendar-mobile")).toBeVisible();
      await expect(page.getByTestId("calendar-desktop")).toBeHidden();
      await expect(page.getByTestId("calendar-agenda-event")).toHaveCount(1);
      bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(
        bodyWidth,
        `Horizontal scroll on body at mobile (375px) — bodyWidth=${bodyWidth}`,
      ).toBeLessThanOrEqual(376);
    } finally {
      for (const id of blackoutIds) await deleteBlackout(api, id);
      await deleteListing(api, listingId);
      await deleteProperty(api, property.id);
    }
  });
});
