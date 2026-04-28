import type { ApplicantSummary } from "./applicant-summary";

/**
 * Paginated envelope returned by GET /applicants — same shape as
 * ``InquiryListResponse``. ``has_more`` lets the frontend hide the
 * "Load more" button on the last page.
 */
export interface ApplicantListResponse {
  items: ApplicantSummary[];
  total: number;
  has_more: boolean;
}
