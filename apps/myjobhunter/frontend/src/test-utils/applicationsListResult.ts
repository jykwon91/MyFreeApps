import { vi } from "vitest";
import type { useListApplicationsInfiniteQuery } from "@myjobhunter/api-client/store/applicationsApi";
import type { ApplicationListResponse } from "@myjobhunter/api-client/types/application-list-response";

type ListResult = ReturnType<typeof useListApplicationsInfiniteQuery>;

interface ListResultOptions {
  /** The loaded pages, or one page; omitted means nothing has loaded. */
  pages?: ApplicationListResponse[];
  page?: ApplicationListResponse;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  /** True when the rows are a previous sort's while a new one loads. */
  isStale?: boolean;
  /** A request is in flight for the current rows (a refetch), as opposed to a new sort. */
  isFetching?: boolean;
  /** Which way the last fetch went; "forward" with `isError` is a failed next page. */
  direction?: "forward" | "backward";
  fetchNextPage?: () => Promise<{ isError: boolean }>;
}

/** A stand-in for useListApplicationsInfiniteQuery's result, for components that read it. */
export function applicationsListResult(options: ListResultOptions = {}): ListResult {
  const pages = options.pages ?? (options.page ? [options.page] : undefined);
  const data = pages ? { pages, pageParams: pages.map((_, i) => i) } : undefined;
  return {
    data,
    currentData: options.isStale ? undefined : data,
    isLoading: options.isLoading ?? false,
    isFetching: (options.isStale ?? false) || (options.isFetching ?? false),
    direction: options.direction,
    isError: options.isError ?? false,
    error: options.error,
    hasNextPage: options.hasNextPage ?? false,
    isFetchingNextPage: options.isFetchingNextPage ?? false,
    fetchNextPage: options.fetchNextPage ?? vi.fn(() => Promise.resolve({ isError: false })),
    refetch: vi.fn(() => Promise.resolve({ isError: false })),
  } as unknown as ListResult;
}
