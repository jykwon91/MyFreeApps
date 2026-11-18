import { describe, expect, it } from "vitest";
import { showsPagedLoadAlert } from "@/shared/utils/shows-paged-load-alert";

const BOOM = new Error("boom");

describe("showsPagedLoadAlert", () => {
  it("shows when the list couldn't load at all", () => {
    expect(showsPagedLoadAlert({ loadError: BOOM, error: BOOM, hasData: false, isLoadMoreError: false })).toBe(true);
  });

  it("shows when a refresh of a list already on screen failed", () => {
    expect(showsPagedLoadAlert({ loadError: undefined, error: BOOM, hasData: true, isLoadMoreError: false })).toBe(true);
  });

  it("leaves a failed Load more to the footer", () => {
    expect(showsPagedLoadAlert({ loadError: undefined, error: BOOM, hasData: true, isLoadMoreError: true })).toBe(false);
  });

  it("stays quiet when nothing failed, or while a retry of a first load is running", () => {
    expect(showsPagedLoadAlert({ loadError: undefined, error: undefined, hasData: true, isLoadMoreError: false })).toBe(false);
    expect(showsPagedLoadAlert({ loadError: undefined, error: BOOM, hasData: false, isLoadMoreError: false })).toBe(false);
  });
});
