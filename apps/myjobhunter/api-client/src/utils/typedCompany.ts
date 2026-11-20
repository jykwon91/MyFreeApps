import type { ReviewCompanyState } from "../types/application/review-company-state";
import { companyNameProblem } from "./companyNameProblem";
import { newCompanyDraft } from "./newCompanyDraft";

/** A company name typed in to add: new, for Save to add, unless it's too long to add at all. */
export function typedCompany(name: string): ReviewCompanyState {
  const trimmed = name.trim();
  if (companyNameProblem(trimmed)) return { kind: "autoCreateFailed", name: trimmed };
  return newCompanyDraft({ name: trimmed });
}
