import type { ReviewCompanyState } from "../types/application/review-company-state";
import type { CompanyCreateRequest } from "../types/company-create-request";

/** A company that isn't tracked yet, held until Save adds it. */
export function newCompanyDraft(request: CompanyCreateRequest): Extract<ReviewCompanyState, { kind: "new" }> {
  return { kind: "new", request, name: request.name, logoUrl: request.logo_url ?? null };
}
