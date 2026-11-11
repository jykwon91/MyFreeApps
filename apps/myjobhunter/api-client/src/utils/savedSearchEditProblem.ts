import { SAVED_SEARCH_PROBLEMS } from "../constants/savedSearchProblems";
import type { DiscoverySource } from "../types/discovery/discovery-source";
import type { SavedSearchFormValues } from "../types/discovery/saved-search-form-values";
import { isSourceKind } from "./isSourceKind";
import { savedSearchNameProblem } from "./savedSearchNameProblem";
import { savedSearchProblem } from "./savedSearchProblem";

/** Why an edit can't be saved, or null. A kind this build can't edit only has its name checked. */
export function savedSearchEditProblem(source: DiscoverySource, values: SavedSearchFormValues): string | null {
  if (isSourceKind(source.source)) return savedSearchProblem(values);
  const nameProblem = savedSearchNameProblem(values.name);
  return nameProblem ? `${SAVED_SEARCH_PROBLEMS.namePrefix}${nameProblem}` : null;
}
