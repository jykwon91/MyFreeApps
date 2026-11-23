import type { DiscoveryRead } from "@myrecipes/api-client/types/recipe/discovery-read";
import type { DiscoverySearch } from "@myrecipes/api-client/types/recipe/discovery-search";

/**
 * Names the step Discover is showing, so focus can follow it when it changes: browsing (and how
 * far the search has got), one result (and how far its read has got), or saving one.
 */
export function discoverViewKey(
  selectedId: string | null,
  isSaving: boolean,
  readStatus: DiscoveryRead["status"] | undefined,
  searchStatus: DiscoverySearch["status"] | undefined,
): string {
  if (selectedId === null) return `browse:${searchStatus ?? "idle"}`;
  if (isSaving) return `save:${selectedId}`;
  return `result:${selectedId}:${readStatus ?? "reading"}`;
}
