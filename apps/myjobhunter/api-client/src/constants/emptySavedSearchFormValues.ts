import type { SavedSearchFormValues } from "../types/discovery/saved-search-form-values";
import { EMPTY_JSEARCH_FORM_VALUES } from "./emptyJSearchFormValues";
import { DEFAULT_REFRESH_INTERVAL_MINUTES } from "./refreshIntervals";

/** A new saved search before anything is chosen: JSearch, refreshed daily. */
export const EMPTY_SAVED_SEARCH_FORM_VALUES: SavedSearchFormValues = {
  source: "jsearch",
  name: "",
  fetchIntervalMinutes: DEFAULT_REFRESH_INTERVAL_MINUTES,
  jsearch: EMPTY_JSEARCH_FORM_VALUES,
  boardToken: "",
  greenhouseExcludedKeywords: [],
  companySlug: "",
  leverExcludedKeywords: [],
};
