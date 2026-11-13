/**
 * Empty answers for paged list endpoints that pages read beyond their own
 * list. The "empty" catch-all answers every GET with `[]`, but these return a
 * page (`{ items, total, has_more }`), and RTK's providesTags maps over
 * `items`, so `[]` throws.
 */
import type { Page } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";
import type { ListingListResponse } from "@mybookkeeper/api-client/types/listing/listing-list-response";
import type { SignedLeaseListResponse } from "@mybookkeeper/api-client/types/lease/signed-lease-list-response";

export const NO_LISTINGS: ListingListResponse = { items: [], total: 0, has_more: false };
export const NO_SIGNED_LEASES: SignedLeaseListResponse = { items: [], total: 0, has_more: false };

/** GET /listings (any filter) with no listings. */
export async function stubNoListings(page: Page): Promise<void> {
  await page.route(/\/api\/listings(\?|$)/, (route) =>
    route.request().method() === "GET" ? route.fulfill(json(NO_LISTINGS)) : route.fallback(),
  );
}

/** GET /signed-leases (any filter) with no leases. */
export async function stubNoSignedLeases(page: Page): Promise<void> {
  await page.route(/\/api\/signed-leases(\?|$)/, (route) =>
    route.request().method() === "GET" ? route.fulfill(json(NO_SIGNED_LEASES)) : route.fallback(),
  );
}
