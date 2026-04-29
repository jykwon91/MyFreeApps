import type { VendorSummary } from "./vendor-summary";

/**
 * Paginated envelope returned by GET /vendors — same shape as
 * ``ApplicantListResponse``. ``has_more`` lets the frontend hide the
 * "Load more" button on the last page.
 */
export interface VendorListResponse {
  items: VendorSummary[];
  total: number;
  has_more: boolean;
}
