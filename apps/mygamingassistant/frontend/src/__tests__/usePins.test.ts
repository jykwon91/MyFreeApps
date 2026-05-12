/**
 * Unit tests for usePins hook.
 *
 * Coverage:
 *  - pin() adds an entry; isPinned() returns true
 *  - unpin() removes an entry; isPinned() returns false
 *  - re-renders re-read from localStorage (round-trip)
 *  - cross-tab sync via storage event
 *  - graceful degradation when localStorage throws
 */
import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePins } from "@/hooks/usePins";

const GAME = "valorant";
const MAP = "bind";
const SIDE = "side_a";
const KEY = `mga.pins.${GAME}.${MAP}.${SIDE}`;

function clearStorage() {
  localStorage.clear();
}

describe("usePins", () => {
  beforeEach(clearStorage);
  afterEach(clearStorage);

  it("starts with no pins", () => {
    const { result } = renderHook(() => usePins(GAME, MAP, SIDE));
    expect(result.current.pinnedIds).toEqual([]);
  });

  it("pin() adds a lineup id", () => {
    const { result } = renderHook(() => usePins(GAME, MAP, SIDE));
    act(() => result.current.pin("lineup-1"));
    expect(result.current.isPinned("lineup-1")).toBe(true);
    expect(result.current.pinnedIds).toContain("lineup-1");
  });

  it("pin() is idempotent (no duplicate entries)", () => {
    const { result } = renderHook(() => usePins(GAME, MAP, SIDE));
    act(() => {
      result.current.pin("lineup-1");
      result.current.pin("lineup-1");
    });
    expect(result.current.pinnedIds.filter((id) => id === "lineup-1")).toHaveLength(1);
  });

  it("unpin() removes a lineup id", () => {
    const { result } = renderHook(() => usePins(GAME, MAP, SIDE));
    act(() => result.current.pin("lineup-1"));
    act(() => result.current.unpin("lineup-1"));
    expect(result.current.isPinned("lineup-1")).toBe(false);
    expect(result.current.pinnedIds).not.toContain("lineup-1");
  });

  it("reorder() changes the order of pinnedIds", () => {
    const { result } = renderHook(() => usePins(GAME, MAP, SIDE));
    act(() => {
      result.current.pin("a");
      result.current.pin("b");
      result.current.pin("c");
    });
    act(() => result.current.reorder(["c", "a", "b"]));
    expect(result.current.pinnedIds).toEqual(["c", "a", "b"]);
  });

  it("persists to localStorage (round-trip)", () => {
    const { result } = renderHook(() => usePins(GAME, MAP, SIDE));
    act(() => result.current.pin("lineup-saved"));

    const raw = localStorage.getItem(KEY);
    expect(raw).not.toBeNull();
    const parsed: unknown = JSON.parse(raw!);
    expect(Array.isArray(parsed)).toBe(true);
    const arr = parsed as Array<{ lineup_id: string }>;
    expect(arr.some((e) => e.lineup_id === "lineup-saved")).toBe(true);
  });

  it("reads existing localStorage on mount", () => {
    // Pre-seed localStorage
    localStorage.setItem(KEY, JSON.stringify([{ lineup_id: "pre-seeded", sort_order: 0 }]));
    const { result } = renderHook(() => usePins(GAME, MAP, SIDE));
    expect(result.current.isPinned("pre-seeded")).toBe(true);
  });

  it("cross-tab sync: updates state on storage event", () => {
    const { result } = renderHook(() => usePins(GAME, MAP, SIDE));
    // Simulate another tab writing to the same key
    localStorage.setItem(KEY, JSON.stringify([{ lineup_id: "from-other-tab", sort_order: 0 }]));
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: KEY,
          newValue: JSON.stringify([{ lineup_id: "from-other-tab", sort_order: 0 }]),
          storageArea: localStorage,
        }),
      );
    });
    expect(result.current.isPinned("from-other-tab")).toBe(true);
  });

  it("does not react to storage events for different keys", () => {
    const { result } = renderHook(() => usePins(GAME, MAP, SIDE));
    act(() => result.current.pin("existing"));

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "mga.pins.other.map.side_b",
          newValue: JSON.stringify([{ lineup_id: "irrelevant", sort_order: 0 }]),
          storageArea: localStorage,
        }),
      );
    });

    // Our pins should be unchanged
    expect(result.current.isPinned("existing")).toBe(true);
    expect(result.current.isPinned("irrelevant")).toBe(false);
  });

  it("graceful degradation: falls back to in-memory when localStorage throws", () => {
    // Simulate storage quota exceeded
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });

    const { result } = renderHook(() => usePins(GAME, MAP, SIDE));
    // Should not throw; should still update state
    act(() => result.current.pin("in-memory-lineup"));
    expect(result.current.isPinned("in-memory-lineup")).toBe(true);

    spy.mockRestore();
    // suppress unused var lint
    void originalSetItem;
  });
});
