import type { ReviewCompanyState } from "../types/application/review-company-state";

/** The id to save the application under, or null when there's no company to save it to yet. */
export function readCompanyId(company: ReviewCompanyState): string | null {
  return company.kind === "autoCreateFailed" ? null : company.companyId;
}
