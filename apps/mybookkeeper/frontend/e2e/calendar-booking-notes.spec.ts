import { test, expect, type APIRequestContext } from "./fixtures/auth";
import type { Locator, Page } from "@playwright/test";
import { createProperty, deleteListing, deleteProperty } from "./fixtures/seed-data";
import path from "path";
import { fileURLToPath } from "url";
import { toasts } from "./fixtures/toasts";
import { deleteBlackout } from "./fixtures/blackouts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_FIXTURE = path.join(__dirname, "fixtures", "listings", "test-photo-with-gps.jpg");

function eventBar(page: Page, eventId: string): Locator {
  return page.locator(`[data-testid="calendar-event-bar"][data-event-id="${eventId}"]`);
}

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

async function seedBlackout(api: APIRequestContext, payload: SeedBlackoutPayload): Promise<string> {
  const res = await api.post("/test/seed-blackout", { data: payload });
  if (!res.ok()) throw new Error(`seedBlackout failed: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { id: string };
  return body.id;
}

/** Seeds a property → listing → June booking, registering each cleanup as soon as it exists. */
async function seedBooking(
  api: APIRequestContext,
  label: string,
  cleanups: Array<() => Promise<void>>,
): Promise<string> {
  const runId = Date.now();
  const property = await createProperty(api, { name: `E2E ${label} ${runId}` });
  cleanups.push(() => deleteProperty(api, property.id));
  const listingId = await seedListing(api, {
    property_id: property.id,
    title: `E2E ${label} Listing ${runId}`,
    status: "active",
  });
  cleanups.push(() => deleteListing(api, listingId));
  const blackoutId = await seedBlackout(api, {
    listing_id: listingId,
    starts_on: "2026-06-05",
    ends_on: "2026-06-10",
    source: "airbnb",
    source_event_id: `e2e-${label.toLowerCase()}-${runId}`,
  });
  cleanups.push(() => deleteBlackout(api, blackoutId));
  return blackoutId;
}

test.describe("Calendar booking notes + attachments", () => {
  const cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  });

  test("notes persist across page reloads", async ({ authedPage: page, api }) => {
    const blackoutId = await seedBooking(api, "Notes", cleanups);

    // Navigate to the calendar with the test window.
    await page.goto("/calendar?from=2026-06-01&to=2026-07-01&view=timeline");
    await page.waitForLoadState("networkidle");

    // Open the detail dialog by clicking the event bar.
    // Other tests seed bookings in the same window, so target this one by id.
    const bar = eventBar(page, blackoutId);
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
    await expect(toasts(page).getByText("Notes saved")).toBeVisible({ timeout: 5000 });

    // Close dialog and reload.
    await page.keyboard.press("Escape");
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Re-open the detail dialog.
    await eventBar(page, blackoutId).click();

    const textareaAfterReload = page.getByTestId("blackout-notes-textarea");
    await expect(textareaAfterReload).toHaveValue("Guest: Alice Smith, conf #AB1234");

    // Notes indicator should be visible on the bar now.
    await page.keyboard.press("Escape");
    await expect(eventBar(page, blackoutId).getByTestId("event-bar-indicators")).toBeVisible();
  });

  test("image attachment upload → preview appears → reload → still there → delete → gone", async ({
    authedPage: page,
    api,
  }) => {
    const blackoutId = await seedBooking(api, "Attach", cleanups);

    await page.goto("/calendar?from=2026-06-01&to=2026-07-01&view=timeline");
    await page.waitForLoadState("networkidle");

    // Open detail dialog.
    await eventBar(page, blackoutId).click();

    const dialog = page.getByTestId("calendar-event-detail");
    await expect(dialog).toBeVisible();

    await dialog.locator("input[type='file']").setInputFiles(IMAGE_FIXTURE);

    // Wait for success toast.
    await expect(toasts(page).getByText(/uploaded/i)).toBeVisible({ timeout: 10000 });

    // Image preview should appear.
    const preview = dialog.getByTestId("attachment-image-preview");
    await expect(preview).toBeVisible();

    // Reload and re-open — attachment still there.
    await page.keyboard.press("Escape");
    await page.reload();
    await page.waitForLoadState("networkidle");

    await eventBar(page, blackoutId).click();
    const dialogAfterReload = page.getByTestId("calendar-event-detail");
    await expect(dialogAfterReload).toBeVisible();
    await expect(dialogAfterReload.getByTestId("attachment-card")).toBeVisible();

    // Delete the attachment.
    const deleteBtn = dialogAfterReload.getByTestId("attachment-delete-btn").first();
    await deleteBtn.click();
    await expect(toasts(page).getByText("Attachment removed")).toBeVisible({ timeout: 5000 });

    // Attachment list shows empty state.
    await expect(dialogAfterReload.getByTestId("attachments-empty")).toBeVisible();
  });
});
