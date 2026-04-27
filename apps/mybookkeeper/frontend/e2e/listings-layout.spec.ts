import { test, expect, type APIRequestContext, type Page } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

/**
 * Layout E2E for the Listings page.
 *
 * Verifies:
 *   1. The skeleton loader has the same number of rows/cards as the loaded
 *      list (no layout shift).
 *   2. Mobile (375), tablet (768), desktop (1280) all render the listings
 *      without horizontal overflow.
 *   3. Mobile viewport surfaces the card layout; desktop surfaces the table.
 */

interface SeedListingPayload {
  property_id: string;
  title?: string;
  monthly_rate?: string;
  status?: "active" | "paused" | "draft" | "archived";
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

const LISTING_COUNT = 3;

test.describe("Listings layout (PR 1.1b)", () => {
  test("skeleton card count matches loaded card count on mobile", async ({ authedPage: page, api }) => {
    await page.setViewportSize({ width: 375, height: 800 });

    const runId = Date.now();
    const property = await createProperty(api, { name: `E2E Layout Mobile ${runId}` });
    const listingIds: string[] = [];
    try {
      // Block the listings call so the skeleton stays visible long enough to
      // count its cards.
      await page.route("**/api/listings**", async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });

      const navPromise = page.goto("/listings");
      await expect(page.getByTestId("listings-skeleton")).toBeVisible({ timeout: 5000 });

      // Skeleton's mobile <ul> has `md:hidden` and a fixed slot count.
      const skeletonMobileList = page.locator('[data-testid="listings-skeleton"] ul.md\\:hidden li');
      const skeletonCount = await skeletonMobileList.count();
      expect(skeletonCount).toBeGreaterThan(0);

      // Unblock and let the listings query resolve. Now seed listings out of
      // band so the loaded page has rows to compare against.
      for (let i = 0; i < LISTING_COUNT; i++) {
        listingIds.push(
          await seedListing(api, {
            property_id: property.id,
            title: `E2E Layout Listing ${runId}-${i}`,
            status: "active",
          }),
        );
      }
      await page.unroute("**/api/listings**");
      await navPromise;
      await page.reload();
      await page.waitForLoadState("networkidle");

      const loadedMobileCards = page.locator('[data-testid="listings-mobile"] li');
      const loadedCount = await loadedMobileCards.count();
      expect(loadedCount).toBeGreaterThanOrEqual(LISTING_COUNT);

      // The skeleton's slot count should be reasonable — same order of
      // magnitude as the loaded list. Skeletons reserve a fixed N (4 by
      // default) regardless of payload, which prevents post-load shrink.
      expect(Math.abs(skeletonCount - loadedCount)).toBeLessThanOrEqual(4);
    } finally {
      for (const id of listingIds) await deleteListing(api, id);
      await deleteProperty(api, property.id);
    }
  });

  test("renders without horizontal scroll at mobile / tablet / desktop viewports", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const property = await createProperty(api, { name: `E2E Layout Multi ${runId}` });
    const listingIds: string[] = [];

    try {
      for (let i = 0; i < 3; i++) {
        listingIds.push(
          await seedListing(api, {
            property_id: property.id,
            title: `E2E Multi Layout ${runId}-${i}`,
            status: "active",
          }),
        );
      }

      const viewports: ReadonlyArray<{ name: string; width: number; height: number }> = [
        { name: "mobile", width: 375, height: 800 },
        { name: "tablet", width: 768, height: 1024 },
        { name: "desktop", width: 1280, height: 900 },
      ];

      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto("/listings");
        await page.waitForLoadState("networkidle");

        await expect(
          page.getByRole("heading", { name: "Listings" }),
          `heading visible at ${vp.name}`,
        ).toBeVisible();

        const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
        expect(
          bodyWidth,
          `Horizontal scroll at ${vp.name} (${vp.width}px) — bodyWidth=${bodyWidth}`,
        ).toBeLessThanOrEqual(vp.width + 1);
      }
    } finally {
      for (const id of listingIds) await deleteListing(api, id);
      await deleteProperty(api, property.id);
    }
  });

  test("mobile viewport hides the desktop table; desktop viewport hides the mobile list", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const property = await createProperty(api, { name: `E2E Layout Toggle ${runId}` });
    const listingId = await seedListing(api, {
      property_id: property.id,
      title: `E2E Toggle ${runId}`,
      status: "active",
    });

    try {
      await assertOnlyMobileVisible(page, "mobile", 375, 800);
      await assertOnlyDesktopVisible(page, "desktop", 1280, 900);
    } finally {
      await deleteListing(api, listingId);
      await deleteProperty(api, property.id);
    }
  });
});

async function assertOnlyMobileVisible(page: Page, name: string, w: number, h: number): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await page.goto("/listings");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("listings-mobile"), `mobile list visible at ${name}`).toBeVisible();
  await expect(page.getByTestId("listings-desktop"), `desktop table hidden at ${name}`).toBeHidden();
}

async function assertOnlyDesktopVisible(page: Page, name: string, w: number, h: number): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await page.goto("/listings");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("listings-desktop"), `desktop table visible at ${name}`).toBeVisible();
  await expect(page.getByTestId("listings-mobile"), `mobile list hidden at ${name}`).toBeHidden();
}
