import { EMPTY_JSEARCH_FORM_VALUES } from "../constants/emptyJSearchFormValues";
import type { DiscoverySource } from "../types/discovery/discovery-source";
import type { SavedSearchFormValues } from "../types/discovery/saved-search-form-values";
import type { SourceKind } from "../types/discovery/source-kind";
import { jsearchFormValuesFromConfig } from "./jsearchFormValuesFromConfig";

/** A saved search as the edit form starts: every field from the row. An unknown kind edits as JSearch would. */
export function savedSearchFormValues(source: DiscoverySource, kind: SourceKind): SavedSearchFormValues {
  const config = source.config ?? {};
  const keywords = (config.excluded_keywords as string[] | undefined) ?? [];
  return {
    source: kind,
    name: source.name,
    fetchIntervalMinutes: source.fetch_interval_minutes,
    jsearch: source.source === "jsearch" ? jsearchFormValuesFromConfig(config) : EMPTY_JSEARCH_FORM_VALUES,
    boardToken: (config.board_token as string | undefined) ?? "",
    greenhouseExcludedKeywords: keywords,
    companySlug: (config.company_slug as string | undefined) ?? "",
    leverExcludedKeywords: keywords,
  };
}
