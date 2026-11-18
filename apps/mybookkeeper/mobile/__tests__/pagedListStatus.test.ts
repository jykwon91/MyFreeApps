import { canLoadMore } from "../src/lib/canLoadMore";
import { hasCurrentPages } from "../src/lib/hasCurrentPages";
import type { PagedListStatus } from "../src/types/PagedListStatus";

const loaded: PagedListStatus = {
  hasData: true,
  isFiltering: false,
  loadError: undefined,
  hasNextPage: true,
  isFetchingNextPage: false,
  isLoadMoreError: false,
};

describe("hasCurrentPages", () => {
  it("is true once the current filters' list has loaded", () => {
    expect(hasCurrentPages(loaded)).toBe(true);
  });

  it("is false before anything loads, while a new filter loads, and after it failed", () => {
    expect(hasCurrentPages({ ...loaded, hasData: false })).toBe(false);
    expect(hasCurrentPages({ ...loaded, isFiltering: true })).toBe(false);
    expect(hasCurrentPages({ ...loaded, loadError: new Error("offline") })).toBe(false);
  });

  it("stays true after a failed load-more, so the rows already loaded stay", () => {
    expect(hasCurrentPages({ ...loaded, isLoadMoreError: true })).toBe(true);
  });
});

describe("canLoadMore", () => {
  it("asks for the next page when there is one and nothing is on its way", () => {
    expect(canLoadMore(loaded)).toBe(true);
  });

  it("doesn't ask at the end, while a page is on its way, or after one failed until the person retries", () => {
    expect(canLoadMore({ ...loaded, hasNextPage: false })).toBe(false);
    expect(canLoadMore({ ...loaded, isFetchingNextPage: true })).toBe(false);
    expect(canLoadMore({ ...loaded, isLoadMoreError: true })).toBe(false);
  });
});
