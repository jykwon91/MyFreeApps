import type { InquirySummary } from "./inquiry-summary";

/**
 * Paginated envelope returned by GET /inquiries — same shape as
 * ListingListResponse. ``has_more`` lets the frontend hide the "Load more"
 * button on the last page.
 */
export interface InquiryListResponse {
  items: InquirySummary[];
  total: number;
  has_more: boolean;
}
