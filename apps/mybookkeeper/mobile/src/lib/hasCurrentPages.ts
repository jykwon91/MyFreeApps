import type { PagedListStatus } from "../types/PagedListStatus";

/**
 * Whether the rows a paging hook holds were loaded under the current filters. While a new filter loads its
 * first page, and after that page failed, the hook still holds the previous filter's rows; a phone list shows
 * its skeleton, then its error, rather than those.
 */
export function hasCurrentPages(status: PagedListStatus): boolean {
  return status.hasData && !status.isFiltering && status.loadError === undefined;
}
