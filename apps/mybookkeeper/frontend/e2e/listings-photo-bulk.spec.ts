import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { test, expect, type APIRequestContext, type Page } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

/**
 * Photo bulk-actions E2E — multi-select + bulk delete.
 *
 * Seeds a listing with 3 photos, selects 2 via checkboxes, bulk deletes,
 * and verifies the grid now shows 1 photo — both in the UI and via API.
 *
 * Each test tears down its own seed data in `finally` per project rules.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PHOTO = path.join(__dirname, "fixtures", "listings", "test-photo-with-gps.jpg");

async function seedListingWithPhotos(
  api: APIRequestContext,
  propertyId: string,
  runId: number,
  photoCount: number,
): Promise<string> {
  const seedRes = await api.post("/test/seed-listing", {
    data: {
      property_id: propertyId,
      title: `E2E Bulk Photo Listing ${runId}`,
      monthly_rate: "1500.00",
      room_type: "private_room",
      status: "active",
    },
  });
  expect(seedRes.ok()).toBeTruthy();
  const { id: listingId } = (await seedRes.json()) as { id: string };

  // Upload N photos to the listing.
  const photoBytes = fs.readFileSync(FIXTURE_PHOTO);
  for (let i = 0; i < photoCount; i++) {
    const uploadRes = await api.post(`/listings/${listingId}/photos`, {
      multipart: {
        files: {
          name: `test-photo-${i}.jpg`,
          mimeType: "image/jpeg",
          buffer: photoBytes,
        },
      },
    });
    expect(uploadRes.ok()).toBeTruthy();
  }

  return listingId;
}

async function deleteListingViaTestApi(
  api: APIRequestContext,
  listingId: string,
): Promise<void> {
  await api.delete(`/test/listings/${listingId}`).catch(() => {});
}

async function waitForPhotos(page: Page, count: number): Promise<void> {
  await expect(page.getByTestId("listing-photo-card")).toHaveCount(count, {
    timeout: 15000,
  });
}

test.describe("Photo bulk actions (PR multi-select)", () => {
  test.skip(!fs.existsSync(FIXTURE_PHOTO), "GPS-EXIF fixture missing — run scripts/build-listings-fixtures.py");

  test("user can select 2 of 3 photos with checkboxes, bulk delete, and grid shows 1 remaining", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const property = await createProperty(api, { name: `E2E Bulk Delete Property ${runId}` });
    let listingId: string | null = null;

    try {
      listingId = await seedListingWithPhotos(api, property.id, runId, 3);

      await page.goto(`/listings/${listingId}`);
      await expect(
        page.getByRole("heading", { name: `E2E Bulk Photo Listing ${runId}` }),
      ).toBeVisible({ timeout: 10000 });

      // Wait for all 3 photos to render.
      await waitForPhotos(page, 3);

      // The toolbar should NOT be visible before any checkbox is clicked.
      await expect(page.getByTestId("photo-selection-toolbar")).not.toBeVisible();

      // Click the first two checkboxes to select photos 0 and 1.
      const checkboxes = page.getByTestId("listing-photo-checkbox");
      await checkboxes.nth(0).click();
      await checkboxes.nth(1).click();

      // Toolbar appears and shows "2 selected".
      await expect(page.getByTestId("photo-selection-toolbar")).toBeVisible();
      await expect(page.getByTestId("photo-selection-count")).toHaveText("2 selected");

      // Click bulk delete — confirm dialog appears.
      await page.getByTestId("photo-bulk-delete-button").click();
      await expect(page.getByText(/Delete 2 photos\?/i)).toBeVisible();

      // Confirm the delete.
      await page.getByRole("button", { name: /Delete 2 photos/i }).click();

      // Grid should now show 1 photo.
      await waitForPhotos(page, 1);

      // Toolbar should be gone (selection was cleared after delete).
      await expect(page.getByTestId("photo-selection-toolbar")).not.toBeVisible();

      // Verify via API.
      const afterRes = await api.get(`/listings/${listingId}`);
      expect(afterRes.ok()).toBeTruthy();
      const afterBody = (await afterRes.json()) as { photos: unknown[] };
      expect(afterBody.photos).toHaveLength(1);
    } finally {
      if (listingId) {
        await deleteListingViaTestApi(api, listingId);
      }
      await deleteProperty(api, property.id);
    }
  });

  test("Select all button selects all photos and count matches", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const property = await createProperty(api, { name: `E2E Select All Property ${runId}` });
    let listingId: string | null = null;

    try {
      listingId = await seedListingWithPhotos(api, property.id, runId, 3);

      await page.goto(`/listings/${listingId}`);
      await expect(
        page.getByRole("heading", { name: `E2E Bulk Photo Listing ${runId}` }),
      ).toBeVisible({ timeout: 10000 });

      await waitForPhotos(page, 3);

      // Select one photo to bring the toolbar up.
      const firstCheckbox = page.getByTestId("listing-photo-checkbox").first();
      await firstCheckbox.click();
      await expect(page.getByTestId("photo-selection-count")).toHaveText("1 selected");

      // Click Select all.
      await page.getByTestId("photo-select-all-button").click();
      await expect(page.getByTestId("photo-selection-count")).toHaveText("3 selected");

      // "Select all" button should disappear when all are selected.
      await expect(page.getByTestId("photo-select-all-button")).not.toBeVisible();

      // Clear deselects all and hides the toolbar.
      await page.getByTestId("photo-clear-selection-button").click();
      await expect(page.getByTestId("photo-selection-toolbar")).not.toBeVisible();
    } finally {
      if (listingId) {
        await deleteListingViaTestApi(api, listingId);
      }
      await deleteProperty(api, property.id);
    }
  });
});
