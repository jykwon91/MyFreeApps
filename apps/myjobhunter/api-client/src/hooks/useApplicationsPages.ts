import { useInfinitePages } from "@platform/core/hooks/useInfinitePages";
import { useListApplicationsInfiniteQuery } from "../store/applicationsApi";
import type { ApplicationsListQuery } from "../types/application/applications-list-query";
import type { ApplicationsPagesState } from "../types/application/applications-pages-state";

/**
 * GET /applications a page at a time, sorted on the server so the order holds
 * across pages. Shared by the web table and the phone list. `skip` waits for
 * an id the filter needs.
 */
export function useApplicationsPages(arg: ApplicationsListQuery, skip = false): ApplicationsPagesState {
  const { items, isFiltering, ...pages } = useInfinitePages(useListApplicationsInfiniteQuery(arg, { skip }));
  return { ...pages, applications: items, isSorting: isFiltering };
}
