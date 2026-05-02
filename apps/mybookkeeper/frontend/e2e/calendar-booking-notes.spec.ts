import { test, expect, type APIRequestContext } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * E2E tests for the calendar booking notes + attachments feature.
 *
 * Tests:
 * 1. Add notes → save → reload → assert notes persist.
 * 2. Upload an image attachment → assert preview appears → reload → assert still there.
 * 3. Delete attachment → assert gone.
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

async function seedBlackout(api: APIRequestContext, payload: SeedBlackoutPayload): Promise<string | null> {
  const res = await api.post("/test/seed-blackout", { data: payload });
  if (!res.ok()) return null;
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteListing(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/listings/${id}`).catch(() => {});
}

async function deleteBlackout(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/blackouts/${id}`).catch(() => {});
}

test.describe("Calendar booking notes + attachments", () => {
  test("notes persist across page reloads", async ({ authedPage: page, api }) => {
    const runId = Date.now();
    const property = await createProperty(api, { name: `E2E Notes ${runId}` });
    const listingId = await seedListing(api, {
      property_id: property.id,
      title: `E2E Notes Listing ${runId}`,
      status: "active",
    });
    const blackoutId = await seedBlackout(api, {
      listing_id: listingId,
      starts_on: "2026-06-05",
      ends_on: "2026-06-10",
      source: "airbnb",
      source_event_id: `e2e-notes-${runId}`,
    });

    test.skip(
      blackoutId === null,
      "Blackout seed endpoint not available",
    );

    try {
      // Navigate to the calendar with the test window.
      await page.goto("/calendar?from=2026-06-01&to=2026-07-01");
      await page.waitForLoadState("networkidle");

      // Open the detail dialog by clicking the event bar.
      const bar = page.getByTestId("calendar-event-bar").first();
      await expect(bar).toBeVisible();
      await bar.click();

      const dialog = page.getByTestId("calendar-event-detail");
      await expect(dialog).toBeVisible();

      // Type notes.
      const textarea = page.getByTestId("blackout-notes-textarea");
      await expect(textarea).toBeVisible();
      await textarea.fill("Guest: Alice Smith, conf #AB1234");
      // Blur to trigger save.
      await textarea.blur();

      // Wait for the save success toast.
      await expect(page.getByText("Notes saved")).toBeVisible({ timeout: 5000 });

      // Close dialog and reload.
      await page.keyboard.press("Escape");
      await page.reload();
      await page.waitForLoadState("networkidle");

      // Re-open the detail dialog.
      const barAfterReload = page.getByTestId("calendar-event-bar").first();
      await expect(barAfterReload).toBeVisible();
      await barAfterReload.click();

      const textareaAfterReload = page.getByTestId("blackout-notes-textarea");
      await expect(textareaAfterReload).toHaveValue("Guest: Alice Smith, conf #AB1234");

      // Notes indicator should be visible on the bar now.
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("event-bar-indicators")).toBeVisible();
    } finally {
      if (blackoutId) await deleteBlackout(api, blackoutId);
      await deleteListing(api, listingId);
      await deleteProperty(api, property.id);
    }
  });

  test("image attachment upload → preview appears → reload → still there → delete → gone", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const property = await createProperty(api, { name: `E2E Attach ${runId}` });
    const listingId = await seedListing(api, {
      property_id: property.id,
      title: `E2E Attach Listing ${runId}`,
      status: "active",
    });
    const blackoutId = await seedBlackout(api, {
      listing_id: listingId,
      starts_on: "2026-06-05",
      ends_on: "2026-06-10",
      source: "airbnb",
      source_event_id: `e2e-attach-${runId}`,
    });

    test.skip(blackoutId === null, "Blackout seed endpoint not available");

    try {
      await page.goto("/calendar?from=2026-06-01&to=2026-07-01");
      await page.waitForLoadState("networkidle");

      // Open detail dialog.
      const bar = page.getByTestId("calendar-event-bar").first();
      await bar.click();

      const dialog = page.getByTestId("calendar-event-detail");
      await expect(dialog).toBeVisible();

      // Upload a small PNG fixture.
      const fileInputLocator = dialog.locator("input[type='file']");
      const fixturePath = path.join(__dirname, "fixtures", "listings", "sample.jpg");

      // Use setInputFiles; fall back to creating a minimal PNG if fixture doesn't exist.
      await fileInputLocator.setInputFiles(fixturePath).catch(async () => {
        // Fallback: create a 1x1 PNG in memory.
        const { writeFileSync, mkdirSync } = await import("fs");
        const tmpPath = path.join(__dirname, "fixtures", "_tmp_test.png");
        mkdirSync(path.dirname(tmpPath), { recursive: true });
        // Minimal valid 1x1 PNG bytes.
        const pngBytes = Buffer.from(
          "89504e470d0a1a0a0000000d49484452000000010000000108020000009001" +
          "2e00000000c4944415478016360f8cfc000000200016712c000000000049454e44ae426082",
          "hex",
        );
        writeFileSync(tmpPath, pngBytes);
        await fileInputLocator.setInputFiles(tmpPath);
      });

      // Wait for success toast.
      await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 10000 });

      // Image preview should appear.
      const preview = dialog.getByTestId("attachment-image-preview");
      await expect(preview).toBeVisible();

      // Reload and re-open — attachment still there.
      await page.keyboard.press("Escape");
      await page.reload();
      await page.waitForLoadState("networkidle");

      const barAfterReload = page.getByTestId("calendar-event-bar").first();
      await barAfterReload.click();
      const dialogAfterReload = page.getByTestId("calendar-event-detail");
      await expect(dialogAfterReload).toBeVisible();
      await expect(dialogAfterReload.getByTestId("attachment-card")).toBeVisible();

      // Delete the attachment.
      const deleteBtn = dialogAfterReload.getByTestId("attachment-delete-btn").first();
      await deleteBtn.click();
      await expect(page.getByText("Attachment removed")).toBeVisible({ timeout: 5000 });

      // Attachment list shows empty state.
      await expect(dialogAfterReload.getByTestId("attachments-empty")).toBeVisible();
    } finally {
      if (blackoutId) await deleteBlackout(api, blackoutId);
      await deleteListing(api, listingId);
      await deleteProperty(api, property.id);
    }
  });
});
