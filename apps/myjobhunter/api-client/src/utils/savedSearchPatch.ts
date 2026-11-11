import type { DiscoverySource } from "../types/discovery/discovery-source";
import type { DiscoverySourcePatchRequest } from "../types/discovery/discovery-source-patch-request";
import type { SavedSearchFormValues } from "../types/discovery/saved-search-form-values";
import { isSameJson } from "./isSameJson";
import { isSourceKind } from "./isSourceKind";
import { savedSearchConfig } from "./savedSearchConfig";

/**
 * PATCH /discover/sources/{id} with only what the form changed, or null when nothing did. A changed
 * config is sent whole, with the source kind, so the backend validates it as it would a new one. An
 * empty keyword list is kept only when the saved config has the key, so an untouched search reads
 * as unchanged either way. A kind this build can't edit keeps its config: only its name and
 * frequency change.
 */
export function savedSearchPatch(source: DiscoverySource, values: SavedSearchFormValues): DiscoverySourcePatchRequest | null {
  const patch: DiscoverySourcePatchRequest = {};
  const name = values.name.trim();
  if (name !== source.name) patch.name = name;
  if (values.fetchIntervalMinutes !== source.fetch_interval_minutes) patch.fetch_interval_minutes = values.fetchIntervalMinutes;
  if (isSourceKind(source.source)) {
    const saved = source.config ?? {};
    const config = savedSearchConfig(values, "excluded_keywords" in saved);
    if (!isSameJson(config, saved)) {
      patch.config = config;
      patch.source_kind = source.source;
    }
  }
  return Object.keys(patch).length > 0 ? patch : null;
}
