import { resolveListLoadMode } from "@/shared/lib/list-load-mode";
import type { PagedListStatus } from "@/shared/types/paged-list-status";
import type { PagedListView } from "@/shared/types/paged-list-view";

/**
 * What a paged list page's body shows, from its `use<X>Pages` state.
 *
 * While a new filter loads its first page, and after that page failed, the paging hook still holds the
 * previous filter's rows. A web list never shows them under the new filter: it shows its skeleton, then its
 * error. Rows loaded under the current filters stay up through a failed refresh or a failed "Load more".
 */
export function pagedListView<T>(status: PagedListStatus, rows: readonly T[]): PagedListView<T> {
  const isCurrent = status.hasData && !status.isFiltering && status.loadError === undefined;
  const currentRows = isCurrent ? rows : [];
  return {
    mode: resolveListLoadMode({ hasData: isCurrent, hasError: status.error !== undefined, itemCount: currentRows.length }),
    rows: currentRows,
  };
}
