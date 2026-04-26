import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDashboardFilter } from "@/shared/hooks/useDashboardFilter";
import { REVENUE_TAGS } from "@/shared/lib/constants";
import type { SummaryResponse } from "@/shared/types/summary/summary";

const mockSummary: SummaryResponse = {
  revenue: 5000,
  expenses: 3000,
  profit: 2000,
  by_category: {
    rental_revenue: 5000,
    utilities: 1200,
    maintenance: 800,
    insurance: 1000,
  },
  by_property: [
    { property_id: "p1", name: "Beach House", revenue: 5000, expenses: 3000, profit: 2000 },
  ],
  by_month: [
    { month: "2025-01", revenue: 2500, expenses: 1500, profit: 1000 },
    { month: "2025-02", revenue: 2500, expenses: 1500, profit: 1000 },
  ],
  by_month_expense: [
    { month: "2025-01", utilities: 600, maintenance: 400, insurance: 500 },
    { month: "2025-02", utilities: 600, maintenance: 400, insurance: 500 },
  ],
  by_property_month: [],
};

describe("useDashboardFilter", () => {
  it("returns all data unfiltered by default", () => {
    const { result } = renderHook(() => useDashboardFilter(mockSummary));

    expect(result.current.isFiltered).toBe(false);
    expect(result.current.filteredSummary?.revenue).toBe(5000);
    expect(result.current.filteredSummary?.expenses).toBe(3000);
    expect(result.current.filteredSummary?.profit).toBe(2000);
    expect(result.current.filterState.preset).toBe("all");
  });

  it("returns undefined filteredSummary when summary is undefined", () => {
    const { result } = renderHook(() => useDashboardFilter(undefined));

    expect(result.current.filteredSummary).toBeUndefined();
    expect(result.current.isFiltered).toBe(false);
  });

  it("filters to income only when income preset is set", () => {
    const { result } = renderHook(() => useDashboardFilter(mockSummary));

    act(() => {
      result.current.setPreset("income");
    });

    expect(result.current.isFiltered).toBe(true);
    expect(result.current.filterState.preset).toBe("income");
    expect(result.current.filteredSummary?.revenue).toBe(5000);
    expect(result.current.filteredSummary?.expenses).toBe(0);
    expect(result.current.filteredSummary?.profit).toBe(5000);
    expect(result.current.filteredSummary?.by_category).toEqual({ rental_revenue: 5000 });
  });

  it("filters to expenses only when expenses preset is set", () => {
    const { result } = renderHook(() => useDashboardFilter(mockSummary));

    act(() => {
      result.current.setPreset("expenses");
    });

    expect(result.current.isFiltered).toBe(true);
    expect(result.current.filterState.preset).toBe("expenses");
    expect(result.current.filteredSummary?.revenue).toBe(0);
    expect(result.current.filteredSummary?.expenses).toBe(3000);
    expect(result.current.filteredSummary?.profit).toBe(-3000);
    expect(result.current.filteredSummary?.by_category).toEqual({
      utilities: 1200,
      maintenance: 800,
      insurance: 1000,
    });
  });

  it("resets to all when all preset is set", () => {
    const { result } = renderHook(() => useDashboardFilter(mockSummary));

    act(() => {
      result.current.setPreset("expenses");
    });

    expect(result.current.isFiltered).toBe(true);

    act(() => {
      result.current.setPreset("all");
    });

    expect(result.current.isFiltered).toBe(false);
    expect(result.current.filteredSummary?.revenue).toBe(5000);
    expect(result.current.filteredSummary?.expenses).toBe(3000);
  });

  it("toggles individual categories on and off", () => {
    const { result } = renderHook(() => useDashboardFilter(mockSummary));

    act(() => {
      result.current.setPreset("expenses");
    });

    act(() => {
      result.current.toggleCategory("utilities");
    });

    expect(result.current.isFiltered).toBe(true);
    expect(result.current.filterState.selectedCategories.has("utilities")).toBe(false);
    expect(result.current.filteredSummary?.by_category).toEqual({
      maintenance: 800,
      insurance: 1000,
    });
    expect(result.current.filteredSummary?.expenses).toBe(1800);

    act(() => {
      result.current.toggleCategory("utilities");
    });

    expect(result.current.filterState.selectedCategories.has("utilities")).toBe(true);
    expect(result.current.filteredSummary?.expenses).toBe(3000);
  });

  it("prevents empty selection when toggling the last category off", () => {
    const { result } = renderHook(() => useDashboardFilter(mockSummary));

    act(() => {
      result.current.setPreset("income");
    });

    const incomeCategories = [...REVENUE_TAGS];
    for (let i = 0; i < incomeCategories.length - 1; i++) {
      act(() => {
        result.current.toggleCategory(incomeCategories[i]);
      });
    }

    const lastCategory = incomeCategories[incomeCategories.length - 1];
    expect(result.current.filterState.selectedCategories.size).toBe(1);
    expect(result.current.filterState.selectedCategories.has(lastCategory)).toBe(true);

    act(() => {
      result.current.toggleCategory(lastCategory);
    });

    expect(result.current.filterState.selectedCategories.size).toBe(1);
  });

  it("keeps by_property visible when category filter is active", () => {
    const { result } = renderHook(() => useDashboardFilter(mockSummary));

    act(() => {
      result.current.setPreset("expenses");
    });

    expect(result.current.filteredSummary?.by_property).toEqual(mockSummary.by_property);
    expect(result.current.filteredSummary?.by_property_month).toEqual(mockSummary.by_property_month);
  });

  it("shows by_property when all categories are selected", () => {
    const { result } = renderHook(() => useDashboardFilter(mockSummary));

    expect(result.current.filteredSummary?.by_property).toEqual(mockSummary.by_property);
    expect(result.current.filteredSummary?.by_property_month).toEqual(mockSummary.by_property_month);
  });

  it("resetCategories restores all categories", () => {
    const { result } = renderHook(() => useDashboardFilter(mockSummary));

    act(() => {
      result.current.setPreset("expenses");
    });

    expect(result.current.isFiltered).toBe(true);

    act(() => {
      result.current.resetCategories();
    });

    expect(result.current.isFiltered).toBe(false);
    expect(result.current.filterState.preset).toBe("all");
  });

  it("recalculates by_month when filtered to expenses only", () => {
    const { result } = renderHook(() => useDashboardFilter(mockSummary));

    act(() => {
      result.current.setPreset("expenses");
    });

    const months = result.current.filteredSummary?.by_month ?? [];
    for (const month of months) {
      expect(month.revenue).toBe(0);
      expect(month.expenses).toBeGreaterThan(0);
      expect(month.profit).toBe(-month.expenses);
    }
  });

  it("recalculates by_month when filtered to income only", () => {
    const { result } = renderHook(() => useDashboardFilter(mockSummary));

    act(() => {
      result.current.setPreset("income");
    });

    const months = result.current.filteredSummary?.by_month ?? [];
    for (const month of months) {
      expect(month.expenses).toBe(0);
      expect(month.revenue).toBeGreaterThanOrEqual(0);
      expect(month.profit).toBe(month.revenue);
    }
  });

  it("filters by_month_expense to only selected expense categories", () => {
    const { result } = renderHook(() => useDashboardFilter(mockSummary));

    act(() => {
      result.current.setPreset("expenses");
    });
    act(() => {
      result.current.toggleCategory("utilities");
    });

    const expenseMonths = result.current.filteredSummary?.by_month_expense ?? [];
    for (const month of expenseMonths) {
      expect(month.utilities).toBeUndefined();
      expect(month.maintenance).toBe(400);
      expect(month.insurance).toBe(500);
    }
  });

  it("selectOnly selects a single category and deselects all others", () => {
    const { result } = renderHook(() => useDashboardFilter(mockSummary));

    expect(result.current.isFiltered).toBe(false);

    act(() => {
      result.current.selectOnly("maintenance");
    });

    expect(result.current.isFiltered).toBe(true);
    expect(result.current.filterState.selectedCategories.size).toBe(1);
    expect(result.current.filterState.selectedCategories.has("maintenance")).toBe(true);
    expect(result.current.filteredSummary?.expenses).toBe(800);
    expect(result.current.filteredSummary?.revenue).toBe(0);
    expect(result.current.filteredSummary?.by_category).toEqual({ maintenance: 800 });
  });

  it("selectOnly followed by toggle adds a second category", () => {
    const { result } = renderHook(() => useDashboardFilter(mockSummary));

    act(() => {
      result.current.selectOnly("maintenance");
    });

    expect(result.current.filterState.selectedCategories.size).toBe(1);

    act(() => {
      result.current.toggleCategory("utilities");
    });

    expect(result.current.filterState.selectedCategories.size).toBe(2);
    expect(result.current.filterState.selectedCategories.has("maintenance")).toBe(true);
    expect(result.current.filterState.selectedCategories.has("utilities")).toBe(true);
    expect(result.current.filteredSummary?.expenses).toBe(2000);
  });

  it("selectOnly then resetCategories restores all categories", () => {
    const { result } = renderHook(() => useDashboardFilter(mockSummary));

    act(() => {
      result.current.selectOnly("maintenance");
    });

    expect(result.current.isFiltered).toBe(true);

    act(() => {
      result.current.resetCategories();
    });

    expect(result.current.isFiltered).toBe(false);
    expect(result.current.filteredSummary?.expenses).toBe(3000);
    expect(result.current.filteredSummary?.revenue).toBe(5000);
  });
});
