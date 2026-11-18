import type { InfinitePagesState } from "@platform/core/types/paging/infinite-pages-state";

/** What a phone list reads from its api-client `use<X>Pages` hook to decide which rows to show and whether to load more. */
export type PagedListStatus = Pick<
  InfinitePagesState<unknown>,
  "hasData" | "isFiltering" | "loadError" | "hasNextPage" | "isFetchingNextPage" | "isLoadMoreError"
>;
