import { describe, expect, it, vi } from "vitest";
import { profileListState } from "../utils/profileListState";

describe("profileListState", () => {
  it("has no items and no error before the first load lands", () => {
    const state = profileListState<string>({ currentData: undefined, isError: false, refetch: vi.fn() });
    expect(state.items).toBeUndefined();
    expect(state.hasError).toBe(false);
  });

  it("keeps a failed first load apart from an empty list", () => {
    const failed = profileListState<string>({ currentData: undefined, isError: true, refetch: vi.fn() });
    const empty = profileListState<string>({ currentData: { items: [] }, isError: false, refetch: vi.fn() });
    expect(failed.items).toBeUndefined();
    expect(failed.hasError).toBe(true);
    expect(empty.items).toEqual([]);
  });

  it("keeps the loaded items when a later refresh fails", () => {
    const state = profileListState<string>({ currentData: { items: ["a"] }, isError: true, refetch: vi.fn() });
    expect(state.items).toEqual(["a"]);
    expect(state.hasError).toBe(true);
  });

  it("retries by refetching and resolves once the refetch does", async () => {
    let finish: () => void = () => {};
    const refetch = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const state = profileListState<string>({ currentData: undefined, isError: true, refetch });

    let settled = false;
    const retrying = Promise.resolve(state.retry()).then(() => { settled = true; });
    expect(refetch).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(settled).toBe(false);
    finish();
    await retrying;
    expect(settled).toBe(true);
  });
});
