// @vitest-environment jsdom
import { Activity, createElement, StrictMode, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useInfinitePages } from "../hooks/useInfinitePages";
import type { InfinitePagesQuery } from "../types/paging/infinite-pages-query";
import type { PageOfItems } from "../types/paging/page-of-items";

interface Row {
  id: string;
}

function makeQuery(overrides: Partial<InfinitePagesQuery<PageOfItems<Row>>> = {}): InfinitePagesQuery<PageOfItems<Row>> {
  const data = { pages: [{ items: [{ id: "a" }], total: 2 }] };
  return {
    data,
    currentData: data,
    isLoading: false,
    isFetching: false,
    isError: false,
    hasNextPage: true,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

describe("useInfinitePages loadMore", () => {
  it("fetches the next page straight away when nothing else is loading", () => {
    const query = makeQuery();
    const { result } = renderHook(() => useInfinitePages(query));
    act(() => result.current.loadMore());
    expect(query.fetchNextPage).toHaveBeenCalledTimes(1);
    expect(result.current.isFetchingNextPage).toBe(false);
  });

  it("waits out a refetch, showing loading meanwhile, then fetches the next page", () => {
    const refetching = makeQuery({ isFetching: true });
    const { result, rerender } = renderHook(({ query }) => useInfinitePages(query), { initialProps: { query: refetching } });
    act(() => result.current.loadMore());
    expect(refetching.fetchNextPage).not.toHaveBeenCalled();
    expect(result.current.isFetchingNextPage).toBe(true);

    const settled = makeQuery({ fetchNextPage: refetching.fetchNextPage });
    rerender({ query: settled });
    expect(settled.fetchNextPage).toHaveBeenCalledTimes(1);
    expect(result.current.isFetchingNextPage).toBe(false);
  });

  it("does nothing, and stops loading, when the refetch leaves no next page", () => {
    const refetching = makeQuery({ isFetching: true });
    const { result, rerender } = renderHook(({ query }) => useInfinitePages(query), { initialProps: { query: refetching } });
    act(() => result.current.loadMore());
    expect(result.current.isFetchingNextPage).toBe(true);

    const settled = makeQuery({ hasNextPage: false, fetchNextPage: refetching.fetchNextPage });
    rerender({ query: settled });
    expect(settled.fetchNextPage).not.toHaveBeenCalled();
    expect(result.current.isFetchingNextPage).toBe(false);
  });

  it("fetches once, not on every later render", () => {
    const refetching = makeQuery({ isFetching: true });
    const { result, rerender } = renderHook(({ query }) => useInfinitePages(query), { initialProps: { query: refetching } });
    act(() => result.current.loadMore());
    const settled = makeQuery({ fetchNextPage: refetching.fetchNextPage });
    rerender({ query: settled });
    rerender({ query: makeQuery({ fetchNextPage: refetching.fetchNextPage }) });
    expect(refetching.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("drops a queued load-more when the filter changes, loading the new filter's first page (uncached)", () => {
    const refetching = makeQuery({ isFetching: true, originalArgs: { state: "inbox" } });
    const { result, rerender } = renderHook(({ query }) => useInfinitePages(query), { initialProps: { query: refetching } });
    act(() => result.current.loadMore());
    expect(result.current.isFetchingNextPage).toBe(true);

    const switched = makeQuery({ isFetching: true, originalArgs: { state: "inbox", source_id: "s1" }, fetchNextPage: refetching.fetchNextPage });
    rerender({ query: switched });
    expect(result.current.isFetchingNextPage).toBe(false);

    rerender({ query: makeQuery({ originalArgs: { state: "inbox", source_id: "s1" }, fetchNextPage: refetching.fetchNextPage }) });
    expect(refetching.fetchNextPage).not.toHaveBeenCalled();
    expect(result.current.isFetchingNextPage).toBe(false);
  });

  it("drops a queued load-more when the filter changes to one already cached", () => {
    const refetching = makeQuery({ isFetching: true, originalArgs: { state: "inbox" } });
    const { result, rerender } = renderHook(({ query }) => useInfinitePages(query), { initialProps: { query: refetching } });
    act(() => result.current.loadMore());

    const cached = makeQuery({ originalArgs: { state: "saved" }, fetchNextPage: refetching.fetchNextPage });
    rerender({ query: cached });
    expect(refetching.fetchNextPage).not.toHaveBeenCalled();
    expect(result.current.isFetchingNextPage).toBe(false);
  });

  it("keeps a queued load-more when the argument is rebuilt with the same values", () => {
    const refetching = makeQuery({ isFetching: true, originalArgs: { state: "inbox" } });
    const { result, rerender } = renderHook(({ query }) => useInfinitePages(query), { initialProps: { query: refetching } });
    act(() => result.current.loadMore());
    rerender({ query: makeQuery({ originalArgs: { state: "inbox" }, fetchNextPage: refetching.fetchNextPage }) });
    expect(refetching.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("fetches the next page once even when the in-flight request failed, and does not loop", () => {
    const refetching = makeQuery({ isFetching: true, originalArgs: { state: "inbox" } });
    const { result, rerender } = renderHook(({ query }) => useInfinitePages(query), { initialProps: { query: refetching } });
    act(() => result.current.loadMore());

    const failed = makeQuery({ isError: true, error: { status: 500 }, originalArgs: { state: "inbox" }, fetchNextPage: refetching.fetchNextPage });
    rerender({ query: failed });
    rerender({ query: { ...failed } });
    rerender({ query: { ...failed } });
    expect(refetching.fetchNextPage).toHaveBeenCalledTimes(1);
    expect(result.current.isFetchingNextPage).toBe(false);
  });
});

describe("useInfinitePages effect re-runs and repeat calls", () => {
  function releaseOnce(wrapper?: ({ children }: { children: ReactNode }) => ReactNode) {
    const refetching = makeQuery({ isFetching: true });
    const hook = renderHook(({ query }) => useInfinitePages(query), { initialProps: { query: refetching }, wrapper });
    act(() => hook.result.current.loadMore());
    hook.rerender({ query: makeQuery({ fetchNextPage: refetching.fetchNextPage }) });
    return { ...hook, fetchNextPage: refetching.fetchNextPage };
  }

  it("fetches once per release under StrictMode", () => {
    const { fetchNextPage } = releaseOnce(StrictMode);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("does not fetch again when the effects re-run after an Activity hide and show", () => {
    let mode: "visible" | "hidden" = "visible";
    const wrapper = ({ children }: { children: ReactNode }) => createElement(Activity, { mode, children });
    const { fetchNextPage, rerender } = releaseOnce(wrapper);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    mode = "hidden";
    rerender({ query: makeQuery({ fetchNextPage }) });
    mode = "visible";
    rerender({ query: makeQuery({ fetchNextPage }) });
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("ignores a second loadMore while the next page is already loading", () => {
    const query = makeQuery({ isFetching: true, isFetchingNextPage: true });
    const { result, rerender } = renderHook(({ q }) => useInfinitePages(q), { initialProps: { q: query } });
    act(() => result.current.loadMore());
    rerender({ q: makeQuery({ fetchNextPage: query.fetchNextPage }) });
    expect(query.fetchNextPage).not.toHaveBeenCalled();
  });
});
