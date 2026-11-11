import { SAVED_SEARCH_PROBLEMS } from "../constants/savedSearchProblems";
import type { SavedSearchFormValues } from "../types/discovery/saved-search-form-values";
import { boardTokenProblem } from "./boardTokenProblem";
import { companySlugProblem } from "./companySlugProblem";
import { savedSearchNameProblem } from "./savedSearchNameProblem";

/** The first reason the saved-search form can't be saved, or null. JSearch needs a role; the others a token or slug. */
export function savedSearchProblem(values: SavedSearchFormValues): string | null {
  const nameProblem = savedSearchNameProblem(values.name);
  if (nameProblem) return `${SAVED_SEARCH_PROBLEMS.namePrefix}${nameProblem}`;
  if (values.source === "greenhouse") return boardTokenProblem(values.boardToken);
  if (values.source === "lever") return companySlugProblem(values.companySlug);
  return values.jsearch.roles.length === 0 ? SAVED_SEARCH_PROBLEMS.noRoles : null;
}
