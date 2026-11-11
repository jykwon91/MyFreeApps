import type { SavedSearchFormValues } from "@myjobhunter/api-client/types/discovery/saved-search-form-values";
import type { JSearchFormValues } from "@myjobhunter/api-client/types/discovery/jsearch-form-values";

/** The saved-search sheet's list fields, each with text typed into it that isn't on its list yet. */
export type ChipDraftField =
  | keyof Pick<JSearchFormValues, "roles" | "skills" | "excludedKeywords">
  | keyof Pick<SavedSearchFormValues, "greenhouseExcludedKeywords" | "leverExcludedKeywords">;
