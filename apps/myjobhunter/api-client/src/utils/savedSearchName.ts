import type { DiscoverySource } from "../types/discovery/discovery-source";

/** What a saved search is called on its filter and on its postings: its name, else its source key. */
export function savedSearchName(source: DiscoverySource): string {
  return source.name || source.source;
}
