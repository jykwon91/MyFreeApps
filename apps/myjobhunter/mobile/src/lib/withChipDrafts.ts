import type { SavedSearchFormValues } from "@myjobhunter/api-client/types/discovery/saved-search-form-values";
import { CHIP_FIELD_SEPARATOR } from "../constants/savedSearchSheet";
import type { ChipDrafts } from "../types/ChipDrafts";
import { addChipValues } from "./addChipValues";

function add(current: readonly string[], draft: string | undefined): string[] {
  return addChipValues(current, (draft ?? "").split(CHIP_FIELD_SEPARATOR));
}

/** The form with what's still typed into each list field added to its list, as tapping Add would. */
export function withChipDrafts(values: SavedSearchFormValues, drafts: ChipDrafts): SavedSearchFormValues {
  return {
    ...values,
    greenhouseExcludedKeywords: add(values.greenhouseExcludedKeywords, drafts.greenhouseExcludedKeywords),
    leverExcludedKeywords: add(values.leverExcludedKeywords, drafts.leverExcludedKeywords),
    jsearch: {
      ...values.jsearch,
      roles: add(values.jsearch.roles, drafts.roles),
      skills: add(values.jsearch.skills, drafts.skills),
      excludedKeywords: add(values.jsearch.excludedKeywords, drafts.excludedKeywords),
    },
  };
}
