import type { JSearchFormValues } from "./jsearch-form-values";
import type { SourceKind } from "./source-kind";

/** Everything the new and edit saved-search forms hold, for every source kind. */
export interface SavedSearchFormValues {
  source: SourceKind;
  name: string;
  fetchIntervalMinutes: number;
  jsearch: JSearchFormValues;
  boardToken: string;
  greenhouseExcludedKeywords: string[];
  companySlug: string;
  leverExcludedKeywords: string[];
}
