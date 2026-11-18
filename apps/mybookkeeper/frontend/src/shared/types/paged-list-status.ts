import type { InfinitePagesResult } from "@platform/core/types/paging/infinite-pages-result";

/** What a web list page reads from its api-client `use<X>Pages` hook, beside the rows. */
export type PagedListStatus = Pick<
  InfinitePagesResult<unknown>,
  "hasData" | "isFiltering" | "loadError" | "error" | "isFetching" | "isLoadMoreError" | "isFetchingNextPage" | "loadMore" | "refetch"
>;
