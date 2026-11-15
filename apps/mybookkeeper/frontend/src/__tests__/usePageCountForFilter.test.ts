import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePageCountForFilter } from "@/shared/hooks/usePageCountForFilter";

describe("usePageCountForFilter", () => {
  it("starts at one page and counts each Load more", () => {
    const { result } = renderHook(() => usePageCountForFilter("a"));
    expect(result.current.pageCount).toBe(1);

    act(() => result.current.loadMore());
    act(() => result.current.loadMore());

    expect(result.current.pageCount).toBe(3);
  });

  it("reads as one page as soon as the filter changes, however it changed", () => {
    const { result, rerender } = renderHook(({ key }) => usePageCountForFilter(key), {
      initialProps: { key: "a" },
    });
    act(() => result.current.loadMore());

    rerender({ key: "b" });

    expect(result.current.pageCount).toBe(1);
  });

  it("counts Load more under the new filter from its first page", () => {
    const { result, rerender } = renderHook(({ key }) => usePageCountForFilter(key), {
      initialProps: { key: "a" },
    });
    act(() => result.current.loadMore());
    act(() => result.current.loadMore());
    rerender({ key: "b" });

    act(() => result.current.loadMore());

    expect(result.current.pageCount).toBe(2);
  });

  it("starts over when the filter changes back to an earlier one", () => {
    const { result, rerender } = renderHook(({ key }) => usePageCountForFilter(key), {
      initialProps: { key: "a" },
    });
    act(() => result.current.loadMore());
    rerender({ key: "b" });
    rerender({ key: "a" });

    expect(result.current.pageCount).toBe(1);
  });
});
