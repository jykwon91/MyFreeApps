import { vi } from "vitest";
import { infiniteQueryData } from "@/test/rtk-infinite-query-data";

/** A loaded paging query holding no vendors, for a test of a form that only shows the "Assign vendor" dropdown. */
export const EMPTY_VENDOR_PAGES = {
  ...infiniteQueryData({ items: [], total: 0, has_more: false }),
  isLoading: false,
  isFetching: false,
  isFetchingNextPage: false,
  isError: false,
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
};
