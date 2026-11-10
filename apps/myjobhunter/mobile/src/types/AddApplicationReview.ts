import type { ReviewCompanyState } from "@myjobhunter/api-client/types/application/review-company-state";

/** The step after the source: what was read, and the company it will be saved under . */
export interface AddApplicationReview {
  sourceUrl: string | null;
  summary: string | null;
  company: ReviewCompanyState;
}
