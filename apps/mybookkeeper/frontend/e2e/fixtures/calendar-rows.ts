import type { Locator, Page } from "@playwright/test";

/**
 * Event bars on one listing's timeline row.
 *
 * Specs run in parallel against the same organization, and several seed
 * bookings in the same June window, so a page-wide bar count includes other
 * tests' data. Counting inside the test's own listing row keeps each spec's
 * assertions about the data it seeded.
 */
export function listingRowBars(page: Page, listingId: string): Locator {
  return page
    .locator(`[data-testid="calendar-listing-row"][data-listing-id="${listingId}"]`)
    .getByTestId("calendar-event-bar");
}
