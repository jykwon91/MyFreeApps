import type { DiscoverySourceCreate } from "../types/discovery/discovery-source-create-request";
import type { SavedSearchFormValues } from "../types/discovery/saved-search-form-values";
import { savedSearchConfig } from "./savedSearchConfig";

/** POST /discover/sources for the form. A blank name is left out. */
export function savedSearchCreateRequest(values: SavedSearchFormValues): DiscoverySourceCreate {
  return {
    source: values.source,
    name: values.name.trim() || undefined,
    config: savedSearchConfig(values, false),
    fetch_interval_minutes: values.fetchIntervalMinutes,
  };
}
