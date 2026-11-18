import { useListDiscoverySourcesQuery } from "../store/discoverApi";
import type { DiscoverySource } from "../types/discovery/discovery-source";
import type { DiscoverySourceCreate } from "../types/discovery/discovery-source-create-request";
import type { LostCreateRecheck } from "../types/write/lost-create-recheck";
import { useLostCreateRecheck } from "./useLostCreateRecheck";

/**
 * Whether a saved-search add whose answer was lost made it after all: a new active search of the kind and name that were sent.
 * The server keeps those two unique among active searches, and stores a left-out name as "".
 */
export function useSavedSearchCreateRecheck(): LostCreateRecheck<DiscoverySourceCreate, DiscoverySource> {
  const { currentData, refetch } = useListDiscoverySourcesQuery();
  return useLostCreateRecheck(
    currentData,
    async () => await refetch().unwrap(),
    (search, request: DiscoverySourceCreate) => search.source === request.source && search.name === (request.name ?? ""),
  );
}
