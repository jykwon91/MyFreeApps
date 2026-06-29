import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDashboardYears } from "@/shared/hooks/useDashboardYears";

const CURRENT_YEAR = new Date().getFullYear();

describe("useDashboardYears", () => {
  it("returns [currentYear] when dataYears is undefined", () => {
    const { result } = renderHook(() => useDashboardYears(undefined));
    expect(result.current).toEqual([CURRENT_YEAR]);
  });

  it("returns [currentYear] when dataYears is empty", () => {
    const { result } = renderHook(() => useDashboardYears([]));
    expect(result.current).toEqual([CURRENT_YEAR]);
  });

  it("includes every data-bearing year in descending order", () => {
    const { result } = renderHook(() => useDashboardYears([2023, 2024]));

    const years = result.current;
    const idx2024 = years.indexOf(2024);
    const idx2023 = years.indexOf(2023);
    expect(idx2024).toBeGreaterThan(-1);
    expect(idx2023).toBeGreaterThan(-1);
    expect(idx2024).toBeLessThan(idx2023);
  });

  it("deduplicates the current year when it is also a data year", () => {
    const { result } = renderHook(() => useDashboardYears([CURRENT_YEAR]));

    const count = result.current.filter((y) => y === CURRENT_YEAR).length;
    expect(count).toBe(1);
  });

  it("deduplicates repeated data years", () => {
    const { result } = renderHook(() => useDashboardYears([2025, 2025, 2025]));

    const count = result.current.filter((y) => y === 2025).length;
    expect(count).toBe(1);
  });

  it("always includes the current year even if absent from dataYears", () => {
    const { result } = renderHook(() => useDashboardYears([2023, 2022]));
    expect(result.current).toContain(CURRENT_YEAR);
  });

  it("result is sorted descending", () => {
    const { result } = renderHook(() => useDashboardYears([2022, 2024, 2023]));

    const years = result.current;
    for (let i = 0; i < years.length - 1; i++) {
      expect(years[i]).toBeGreaterThan(years[i + 1]);
    }
  });

  it("ignores out-of-range and non-integer years", () => {
    const { result } = renderHook(() => useDashboardYears([1800, NaN, 2024]));

    expect(result.current).toContain(2024);
    expect(result.current).not.toContain(1800);
    expect(result.current.some((y) => Number.isNaN(y))).toBe(false);
  });

  it("lists every supplied year regardless of how few have current data (regression: list is filter-independent)", () => {
    // The years endpoint is unfiltered, so even though the active summary may
    // only contain the current year, all reported years must still appear.
    const input = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];
    const { result } = renderHook(() => useDashboardYears(input));

    expect(result.current).toEqual([
      CURRENT_YEAR,
      CURRENT_YEAR - 1,
      CURRENT_YEAR - 2,
    ]);
  });
});
