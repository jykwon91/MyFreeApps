import type { ListingSummary } from "@/shared/types/listing/listing-summary";

/**
 * Paginated envelope returned by GET /listings.
 *
 * Replaces the bare `ListingSummary[]` shape from PR 1.1b. The `has_more`
 * flag lets the frontend hide the "Load more" button on the last page —
 * closes the pagination-terminator gap logged in TECH_DEBT.md.
 */
export interface ListingListResponse {
  items: ListingSummary[];
  total: number;
  has_more: boolean;
}
