import { useCallback, useState } from "react";
import type { FilterPageCount } from "@/shared/types/filter-page-count";
import type { PageCountForFilter } from "@/shared/types/page-count-for-filter";

/**
 * The "Load more" page count of a list, tied to the filter it was counted under.
 *
 * A filter can change without the page's own filter controls (a sidebar link to the same route,
 * browser Back/Forward), so resetting a counter in those controls' handlers is not enough. The count
 * is stored with its filter key and starts again at 1 when the key changes, adjusted during render
 * (React's "storing information from previous renders" pattern, not an effect), so the first request
 * under a new filter is always its first page, and returning to an earlier filter starts it over.
 */
export function usePageCountForFilter(filterKey: string): PageCountForFilter {
  const [state, setState] = useState<FilterPageCount>({ filterKey, count: 1 });
  if (state.filterKey !== filterKey) {
    setState({ filterKey, count: 1 });
  }
  const pageCount = state.filterKey === filterKey ? state.count : 1;

  const loadMore = useCallback(() => {
    setState((prev) => ({
      filterKey,
      count: (prev.filterKey === filterKey ? prev.count : 1) + 1,
    }));
  }, [filterKey]);

  return { pageCount, loadMore };
}
