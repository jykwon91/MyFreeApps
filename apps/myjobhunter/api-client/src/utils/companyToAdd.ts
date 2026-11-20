import type { ReviewCompanyState } from "../types/application/review-company-state";
import type { CompanyCreateRequest } from "../types/company-create-request";

/** What Save adds for this company: the new company's request, a name left to add, or null when it exists or there's none. */
export function companyToAdd(company: ReviewCompanyState): CompanyCreateRequest | null {
  if (company.kind === "new") return company.request;
  if (company.kind === "autoCreateFailed" && company.name) return { name: company.name };
  return null;
}
