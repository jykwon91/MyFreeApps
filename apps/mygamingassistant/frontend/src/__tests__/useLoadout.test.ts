/**
 * Unit tests for useLoadout hook + computeEffectiveUtilFilter.
 *
 * Coverage:
 *  - Initial state is empty (no loadout)
 *  - setLoadout replaces the loadout
 *  - toggleLoadout adds/removes a slug
 *  - clearLoadout empties the loadout
 *  - Persists to localStorage
 *  - computeEffectiveUtilFilter: all 4 combinations (empty/empty, set/empty, empty/set, both)
 */
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { useLoadout, computeEffectiveUtilFilter } from "@/hooks/useLoadout";

beforeEach(() => {
  localStorage.clear();
});

describe("useLoadout", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useLoadout("val", "side_a"));
    expect(result.current.loadout).toEqual([]);
  });

  it("setLoadout replaces the loadout", () => {
    const { result } = renderHook(() => useLoadout("val", "side_a"));
    act(() => result.current.setLoadout(["smoke", "flash"]));
    expect(result.current.loadout).toEqual(["smoke", "flash"]);
  });

  it("setLoadout deduplicates", () => {
    const { result } = renderHook(() => useLoadout("val", "side_a"));
    act(() => result.current.setLoadout(["smoke", "smoke", "flash"]));
    expect(result.current.loadout).toHaveLength(2);
  });

  it("toggleLoadout adds a slug not in loadout", () => {
    const { result } = renderHook(() => useLoadout("val", "side_a"));
    act(() => result.current.toggleLoadout("smoke"));
    expect(result.current.loadout).toContain("smoke");
  });

  it("toggleLoadout removes a slug already in loadout", () => {
    const { result } = renderHook(() => useLoadout("val", "side_a"));
    act(() => result.current.setLoadout(["smoke", "flash"]));
    act(() => result.current.toggleLoadout("smoke"));
    expect(result.current.loadout).not.toContain("smoke");
    expect(result.current.loadout).toContain("flash");
  });

  it("clearLoadout empties the loadout", () => {
    const { result } = renderHook(() => useLoadout("val", "side_a"));
    act(() => result.current.setLoadout(["smoke", "flash"]));
    act(() => result.current.clearLoadout());
    expect(result.current.loadout).toEqual([]);
  });

  it("persists to localStorage under the correct key", () => {
    const { result } = renderHook(() => useLoadout("cs2", "side_b"));
    act(() => result.current.setLoadout(["molly"]));
    const raw = localStorage.getItem("mga.loadout.cs2.side_b");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed).toContain("molly");
  });

  it("loads initial value from localStorage", () => {
    localStorage.setItem("mga.loadout.val.side_a", JSON.stringify(["smoke"]));
    const { result } = renderHook(() => useLoadout("val", "side_a"));
    expect(result.current.loadout).toContain("smoke");
  });

  it("is keyed per (game, side) — separate state for different sides", () => {
    const { result: resultA } = renderHook(() => useLoadout("val", "side_a"));
    const { result: resultB } = renderHook(() => useLoadout("val", "side_b"));
    act(() => resultA.current.setLoadout(["smoke"]));
    expect(resultA.current.loadout).toContain("smoke");
    expect(resultB.current.loadout).not.toContain("smoke");
  });
});

describe("computeEffectiveUtilFilter", () => {
  it("returns [] when both empty — no filter", () => {
    expect(computeEffectiveUtilFilter([], [])).toEqual([]);
  });

  it("returns selectedUtils when loadout empty", () => {
    expect(computeEffectiveUtilFilter([], ["smoke", "flash"])).toEqual(["smoke", "flash"]);
  });

  it("returns loadout when selectedUtils empty", () => {
    expect(computeEffectiveUtilFilter(["smoke", "molly"], [])).toEqual(["smoke", "molly"]);
  });

  it("returns intersection when both set", () => {
    const result = computeEffectiveUtilFilter(["smoke", "molly"], ["smoke", "flash"]);
    expect(result).toEqual(["smoke"]);
  });

  it("returns empty array when intersection is empty (player lacks chip-filtered utils)", () => {
    const result = computeEffectiveUtilFilter(["molly"], ["smoke"]);
    expect(result).toEqual([]);
  });
});
