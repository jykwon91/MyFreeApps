import { describe, expect, it } from "vitest";
import type { InfinitePagesQuery } from "../types/paging/infinite-pages-query";
import type { PageOfItems } from "../types/paging/page-of-items";
import { describeInfinitePages } from "../utils/describeInfinitePages";
import { flattenPagesById } from "../utils/flattenPagesById";
import { getNextPageOffset } from "../utils/getNextPageOffset";
import { getPagesTotal } from "../utils/getPagesTotal";

interface Row {
  id: string;
}
const page = (ids: string[], total: number): PageOfItems<Row> => ({ items: ids.map((id) => ({ id })), total });

describe("getNextPageOffset", () => {
  it("starts the next page where this one ended", () => {
    expect(getNextPageOffset(page(["a", "b"], 5), 0)).toBe(2);
    expect(getNextPageOffset(page(["c", "d"], 5), 2)).toBe(4);
  });

  it("stops once every matching row is loaded", () => {
    expect(getNextPageOffset(page(["e"], 5), 4)).toBeUndefined();
    expect(getNextPageOffset(page(["a", "b"], 2), 0)).toBeUndefined();
  });

  it("stops on an empty page even if the total says there is more", () => {
    expect(getNextPageOffset(page([], 9), 4)).toBeUndefined();
  });
});

describe("flattenPagesById", () => {
  it("joins the pages in order", () => {
    expect(flattenPagesById([page(["a", "b"], 3), page(["c"], 3)]).map(({ id }) => id)).toEqual(["a", "b", "c"]);
  });

  it("keeps a row that shifted onto the next page where it first appeared", () => {
    expect(flattenPagesById([page(["a", "b"], 4), page(["b", "c"], 4)]).map(({ id }) => id)).toEqual(["a", "b", "c"]);
  });

  it("is empty before anything loads", () => {
    expect(flattenPagesById(undefined)).toEqual([]);
  });
});

describe("getPagesTotal", () => {
  it("reads the latest page's total", () => {
    expect(getPagesTotal([page(["a"], 3), page(["b"], 4)])).toBe(4);
  });

  it("is 0 before anything loads", () => {
    expect(getPagesTotal(undefined)).toBe(0);
    expect(getPagesTotal([])).toBe(0);
  });
});

function query(overrides: Partial<InfinitePagesQuery<PageOfItems<Row>>> = {}): InfinitePagesQuery<PageOfItems<Row>> {
  return {
    isLoading: false,
    isFetching: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: () => undefined,
    refetch: () => Promise.resolve(),
    ...overrides,
  };
}

const held = (...pages: PageOfItems<Row>[]) => ({ pages, pageParams: [] });

describe("describeInfinitePages", () => {
  it("is empty and loading before anything arrives", () => {
    expect(describeInfinitePages(query({ isLoading: true, isFetching: true }), [])).toEqual({
      items: [],
      total: 0,
      isLoading: true,
      hasData: false,
      isFiltering: false,
      loadError: undefined,
      error: undefined,
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoadMoreError: false,
    });
  });

  it("offers the next page only for the current argument", () => {
    const current = held(page(["a"], 3));
    expect(describeInfinitePages(query({ data: current, currentData: current, hasNextPage: true }), []).hasNextPage).toBe(true);
    expect(describeInfinitePages(query({ data: current, hasNextPage: true }), []).hasNextPage).toBe(false);
  });

  it("calls a new argument's first load filtering while the old rows are still held", () => {
    const state = describeInfinitePages(query({ data: held(page(["old"], 1)), isFetching: true }), [{ id: "old" }]);
    expect(state.isFiltering).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.hasData).toBe(true);
    expect(state.items).toEqual([{ id: "old" }]);
  });

  it("calls a failed first load of a new argument a load error, not a load-more error", () => {
    const failure = new Error("down");
    const state = describeInfinitePages(query({ data: held(page(["old"], 1)), isError: true, error: failure, direction: "backward" }), []);
    expect(state.loadError).toBe(failure);
    expect(state.isLoadMoreError).toBe(false);
  });

  it("keeps the rows and flags a failed next page as a load-more error", () => {
    const current = held(page(["a"], 3));
    const state = describeInfinitePages(query({ data: current, currentData: current, isError: true, error: new Error("down"), direction: "forward" }), []);
    expect(state.loadError).toBeUndefined();
    expect(state.isLoadMoreError).toBe(true);
  });

  it("reads the pages of the current argument, not the stale ones held after a failed reload", () => {
    const stale = held(page(["a", "b"], 2));
    const patched = held(page(["a"], 1));
    const state = describeInfinitePages(query({ data: stale, currentData: patched, isError: true, error: new Error("down") }), []);
    expect(state.total).toBe(1);
  });
});
