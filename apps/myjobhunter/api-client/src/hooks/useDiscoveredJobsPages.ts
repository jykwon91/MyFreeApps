import { useInfinitePages } from "@platform/core/hooks/useInfinitePages";
import { useListDiscoveredJobsPagesInfiniteQuery } from "../store/discoverApi";
import type { DiscoveredJobsFilter } from "../types/discovery/discovered-jobs-filter";
import type { DiscoveredJobsPagesState } from "../types/discovery/discovered-jobs-pages-state";

/**
 * GET /discover a page at a time. Refetches when the app comes back to the front, and polls at
 * `pollingInterval` (0: never) while scores are filling in. The inbox's scoring coverage comes from
 * the first page, which every refetch reloads.
 */
export function useDiscoveredJobsPages(filter: DiscoveredJobsFilter, pollingInterval: number): DiscoveredJobsPagesState {
  const query = useListDiscoveredJobsPagesInfiniteQuery(filter, { pollingInterval, refetchOnFocus: true });
  const { items, ...pages } = useInfinitePages(query);
  const firstPage = (query.currentData ?? query.data)?.pages[0];
  return { ...pages, jobs: items, scoredCount: firstPage?.scored_count ?? null, totalCount: firstPage?.total_count ?? null };
}
