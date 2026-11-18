import type { InfinitePagesState } from "@platform/core/types/paging/infinite-pages-state";

/**
 * Whether a paged list's page-level "couldn't load" alert shows: the list couldn't load at all, or a refresh
 * of a list already on screen failed. A failed "Load more" is the footer's to report.
 */
export function showsPagedLoadAlert(state: Pick<InfinitePagesState<unknown>, "loadError" | "error" | "hasData" | "isLoadMoreError">): boolean {
  if (state.loadError !== undefined) return true;
  return state.error !== undefined && state.hasData && !state.isLoadMoreError;
}
