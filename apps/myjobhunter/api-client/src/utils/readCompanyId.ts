import type { ReviewCompanyState } from "../types/application/review-company-state";

/** The id of a company that already exists, or null when there's none yet (it's added on Save, if at all). */
export function readCompanyId(company: ReviewCompanyState): string | null {
  return company.kind === "autoCreateFailed" || company.kind === "new" ? null : company.companyId;
}
