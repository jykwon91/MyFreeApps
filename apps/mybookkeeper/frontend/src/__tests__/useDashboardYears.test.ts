import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDashboardYears } from "@/shared/hooks/useDashboardYears";
import type { SummaryResponse } from "@/shared/types/summary/summary";

const CURRENT_YEAR = new Date().getFullYear();

function makeSummary(months: string[]): SummaryResponse {
  return {
    revenue: 0,
    expenses: 0,
    profit: 0,
    by_category: {},
    by_property: [],
    by_month: months.map((month) => ({ month, revenue: 0, expenses: 0, profit: 0 })),
    by_month_expense: [],
    by_property_month: [],
  };
}

describe("useDashboardYears", () => {
  it("returns [currentYear] when summary is undefined", () => {
    const { result } = renderHook(() => useDashboardYears(undefined));
    expect(result.current).toEqual([CURRENT_YEAR]);
  });

  it("returns [currentYear] when by_month is empty", () => {
    const { result } = renderHook(() => useDashboardYears(makeSummary([])));
    expect(result.current).toEqual([CURRENT_YEAR]);
  });

  it("derives years from by_month entries in descending order", () => {
    const summary = makeSummary(["2024-01", "2024-06", "2023-03", "2023-12"]);
    const { result } = renderHook(() => useDashboardYears(summary));

    // Descending: currentYear (always included) then 2024, 2023
    const years = result.current;
    const idx2024 = years.indexOf(2024);
    const idx2023 = years.indexOf(2023);
    expect(idx2024).toBeGreaterThan(-1);
    expect(idx2023).toBeGreaterThan(-1);
    expect(idx2024).toBeLessThan(idx2023);
  });

  it("deduplicates years from multiple same-year months", () => {
    const summary = makeSummary(["2025-01", "2025-06", "2025-12"]);
    const { result } = renderHook(() => useDashboardYears(summary));

    const count2025 = result.current.filter((y) => y === 2025).length;
    expect(count2025).toBe(1);
  });

  it("always includes current year even if not in by_month", () => {
    const summary = makeSummary(["2023-01", "2022-06"]);
    const { result } = renderHook(() => useDashboardYears(summary));

    expect(result.current).toContain(CURRENT_YEAR);
  });

  it("result is sorted descending", () => {
    const summary = makeSummary(["2022-01", "2024-06", "2023-03"]);
    const { result } = renderHook(() => useDashboardYears(summary));

    const years = result.current;
    for (let i = 0; i < years.length - 1; i++) {
      expect(years[i]).toBeGreaterThan(years[i + 1]);
    }
  });

  it("handles a single month entry", () => {
    const summary = makeSummary(["2024-07"]);
    const { result } = renderHook(() => useDashboardYears(summary));

    expect(result.current).toContain(2024);
    expect(result.current).toContain(CURRENT_YEAR);
  });
});
