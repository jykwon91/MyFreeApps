import type { SavedSearchFormValues } from "../types/discovery/saved-search-form-values";
import { jsearchConfig } from "./jsearchConfig";
import { normalizeCompanySlug } from "./normalizeCompanySlug";

/**
 * The config to send for the form's source kind. An empty keyword list is left out unless
 * `keepEmptyKeywords` (an edit of a config that has the key, so clearing the list is sent); the
 * adapters ignore an empty list either way.
 */
export function savedSearchConfig(values: SavedSearchFormValues, keepEmptyKeywords: boolean): Record<string, unknown> {
  if (values.source === "jsearch") return jsearchConfig(values.jsearch);
  const [key, value, keywords] =
    values.source === "greenhouse"
      ? (["board_token", values.boardToken.trim(), values.greenhouseExcludedKeywords] as const)
      : (["company_slug", normalizeCompanySlug(values.companySlug), values.leverExcludedKeywords] as const);
  const config: Record<string, unknown> = { [key]: value };
  if (keepEmptyKeywords || keywords.length > 0) config.excluded_keywords = keywords;
  return config;
}
