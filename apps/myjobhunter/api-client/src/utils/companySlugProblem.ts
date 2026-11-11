import { COMPANY_SLUG_PATTERN, SAVED_SEARCH_PROBLEMS } from "../constants/savedSearchProblems";
import { normalizeCompanySlug } from "./normalizeCompanySlug";

/** Why a Lever company slug can't be saved, or null. Case doesn't matter: it is saved lowercase. */
export function companySlugProblem(slug: string): string | null {
  const normalized = normalizeCompanySlug(slug);
  if (!normalized) return SAVED_SEARCH_PROBLEMS.noCompanySlug;
  return COMPANY_SLUG_PATTERN.test(normalized) ? null : SAVED_SEARCH_PROBLEMS.badCompanySlug;
}
