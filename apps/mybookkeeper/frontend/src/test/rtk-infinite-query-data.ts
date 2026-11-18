import type { InfiniteQueryDataFields } from "./types/infinite-query-data-fields";

/**
 * The data fields of a loaded RTK Query infinite-query hook result holding one page, `page`. Like
 * `queryData`, RTK sets both `data` (kept across argument changes) and `currentData` (the current
 * argument's only); `hasNextPage` follows the page's `has_more`, as the api-client's paging does.
 */
export function infiniteQueryData<P extends { has_more: boolean }>(page: P | undefined): InfiniteQueryDataFields<P> {
  const data = page === undefined ? undefined : { pages: [page], pageParams: [0] };
  return { data, currentData: data, hasNextPage: page?.has_more ?? false };
}
