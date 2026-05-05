import { test, expect, type APIRequestContext } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

/**
 * E2E tests for the photo lightbox on the Listing detail page.
 *
 * Strategy: seed a real listing via the test endpoint, then intercept the
 * GET /api/listings/:id response to inject synthetic photo objects with
 * data-URL presigned_urls (1×1 red pixel PNG). This avoids needing MinIO
 * to be populated with real objects while still exercising the full lightbox
 * UI flow in the browser.
 */

// 1×1 red pixel PNG as a data URL — stable across runs.
const RED_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==";
const BLUE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

interface SeedListingPayload {
  property_id: string;
  title?: string;
  monthly_rate?: string;
  status?: "active" | "paused" | "draft" | "archived";
}

async function seedListing(api: APIRequestContext, payload: SeedListingPayload): Promise<string> {
  const res = await api.post("/test/seed-listing", { data: payload });
  if (!res.ok()) {
    throw new Error(`seedListing failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteListing(api: APIRequestContext, listingId: string): Promise<void> {
  await api.delete(`/test/listings/${listingId}`).catch(() => {});
}

test.describe("Photo lightbox (PR listings-photo-lightbox)", () => {
  test("clicking a thumbnail opens the lightbox, arrows navigate, Escape closes", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const property = await createProperty(api, { name: `E2E Lightbox Property ${runId}` });
    let listingId: string | null = null;

    try {
      listingId = await seedListing(api, {
        property_id: property.id,
        title: `E2E Lightbox Listing ${runId}`,
        status: "active",
      });

      // Intercept the listing detail API response and inject two synthetic photos.
      await page.route(`**/api/listings/${listingId}`, async (route) => {
        const original = await route.fetch();
        const body = (await original.json()) as Record<string, unknown>;

        const fakePhotos = [
          {
            id: "fake-photo-1",
            listing_id: listingId,
            storage_key: "listings/fake/1.png",
            caption: null,
            display_order: 0,
            created_at: new Date().toISOString(),
            presigned_url: RED_PIXEL_PNG,
          },
          {
            id: "fake-photo-2",
            listing_id: listingId,
            storage_key: "listings/fake/2.png",
            caption: null,
            display_order: 1,
            created_at: new Date().toISOString(),
            presigned_url: BLUE_PIXEL_PNG,
          },
        ];

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...body, photos: fakePhotos }),
        });
      });

      await page.goto(`/listings/${listingId}`);
      await expect(page.getByRole("heading", { name: `E2E Lightbox Listing ${runId}` })).toBeVisible({
        timeout: 10000,
      });
      await page.waitForLoadState("networkidle");

      // The photo grid should show two cards.
      const openButtons = page.getByTestId("listing-photo-open-button");
      await expect(openButtons).toHaveCount(2);

      // --- Open the lightbox on the first photo ---
      await openButtons.first().click();
      const backdrop = page.getByTestId("photo-lightbox-backdrop");
      await expect(backdrop).toBeVisible();

      // Lightbox shows the first image.
      const img = page.getByTestId("photo-lightbox-image");
      await expect(img).toBeVisible();
      await expect(img).toHaveAttribute("src", RED_PIXEL_PNG);

      // Counter shows 1 / 2.
      await expect(page.getByTestId("photo-lightbox-counter")).toHaveText("1 / 2");

      // No previous arrow on the first photo.
      await expect(page.getByTestId("photo-lightbox-prev")).not.toBeVisible();
      await expect(page.getByTestId("photo-lightbox-next")).toBeVisible();

      // --- Navigate right with the arrow button ---
      await page.getByTestId("photo-lightbox-next").click();
      await expect(img).toHaveAttribute("src", BLUE_PIXEL_PNG);
      await expect(page.getByTestId("photo-lightbox-counter")).toHaveText("2 / 2");

      // Now on the last photo: no next arrow.
      await expect(page.getByTestId("photo-lightbox-next")).not.toBeVisible();
      await expect(page.getByTestId("photo-lightbox-prev")).toBeVisible();

      // --- Navigate back with the keyboard arrow key ---
      await page.keyboard.press("ArrowLeft");
      await expect(img).toHaveAttribute("src", RED_PIXEL_PNG);
      await expect(page.getByTestId("photo-lightbox-counter")).toHaveText("1 / 2");

      // --- Close with Escape ---
      await page.keyboard.press("Escape");
      await expect(backdrop).not.toBeVisible();
    } finally {
      if (listingId) await deleteListing(api, listingId);
      await deleteProperty(api, property.id);
    }
  });

  test("clicking outside the image closes the lightbox", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const property = await createProperty(api, { name: `E2E Lightbox Click-Out ${runId}` });
    let listingId: string | null = null;

    try {
      listingId = await seedListing(api, {
        property_id: property.id,
        title: `E2E Lightbox Click-Out Listing ${runId}`,
        status: "active",
      });

      await page.route(`**/api/listings/${listingId}`, async (route) => {
        const original = await route.fetch();
        const body = (await original.json()) as Record<string, unknown>;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ...body,
            photos: [
              {
                id: "fake-photo-only",
                listing_id: listingId,
                storage_key: "listings/fake/only.png",
                caption: null,
                display_order: 0,
                created_at: new Date().toISOString(),
                presigned_url: RED_PIXEL_PNG,
              },
            ],
          }),
        });
      });

      await page.goto(`/listings/${listingId}`);
      await expect(page.getByRole("heading", { name: `E2E Lightbox Click-Out Listing ${runId}` })).toBeVisible({
        timeout: 10000,
      });
      await page.waitForLoadState("networkidle");

      await page.getByTestId("listing-photo-open-button").first().click();
      await expect(page.getByTestId("photo-lightbox-backdrop")).toBeVisible();

      // Click in the top-left corner of the backdrop (outside the centred image).
      await page.mouse.click(5, 5);
      await expect(page.getByTestId("photo-lightbox-backdrop")).not.toBeVisible();
    } finally {
      if (listingId) await deleteListing(api, listingId);
      await deleteProperty(api, property.id);
    }
  });
});
