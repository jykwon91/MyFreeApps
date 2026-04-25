import { useState, useMemo, useCallback } from "react";
import { REVENUE_TAGS, EXPENSE_TAGS } from "@/shared/lib/constants";
import { ALL_DASHBOARD_CATEGORIES, getCategoriesForPreset } from "@/shared/lib/dashboard-filter-config";
import type { CategoryFilterPreset, CategoryFilterState } from "@/shared/types/dashboard/category-filter";
import type { SummaryResponse } from "@/shared/types/summary/summary";
import type { MonthSummary } from "@/shared/types/summary/month-summary";
import type { MonthExpenseSummary } from "@/shared/types/summary/month-expense-summary";
import type { PropertySummary } from "@/shared/types/summary/property-summary";

export interface FilteredSummary {
  revenue: number;
  expenses: number;
  profit: number;
  by_category: Record<string, number>;
  by_month: MonthSummary[];
  by_month_expense: MonthExpenseSummary[];
  by_property: PropertySummary[];
  by_property_month: SummaryResponse["by_property_month"];
}

interface UseDashboardFilterReturn {
  filterState: CategoryFilterState;
  filteredSummary: FilteredSummary | undefined;
  toggleCategory: (category: string) => void;
  selectOnly: (category: string) => void;
  setPreset: (preset: CategoryFilterPreset) => void;
  resetCategories: () => void;
  isFiltered: boolean;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

function detectPreset(categories: Set<string>): CategoryFilterPreset {
  if (setsEqual(categories, getCategoriesForPreset("all"))) return "all";
  if (setsEqual(categories, getCategoriesForPreset("income"))) return "income";
  if (setsEqual(categories, getCategoriesForPreset("expenses"))) return "expenses";
  return "all";
}

function filterByCategory(
  summary: SummaryResponse,
  selected: Set<string>,
): FilteredSummary {
  const includesRevenue = [...selected].some((c) => REVENUE_TAGS.has(c));

  // Filter by_category
  const filteredByCategory: Record<string, number> = {};
  for (const [cat, amount] of Object.entries(summary.by_category)) {
    if (selected.has(cat)) {
      filteredByCategory[cat] = amount;
    }
  }

  // Filter by_month_expense: only include selected expense categories
  const filteredByMonthExpense: MonthExpenseSummary[] = summary.by_month_expense.map((row) => {
    const filtered: MonthExpenseSummary = { month: row.month };
    for (const [key, val] of Object.entries(row)) {
      if (key === "month") continue;
      if (selected.has(key) && typeof val === "number") {
        (filtered as unknown as Record<string, number | string>)[key] = val;
      }
    }
    return filtered;
  });

  // Recalculate totals from filtered categories
  let totalRevenue = 0;
  let totalExpenses = 0;

  for (const [cat, amount] of Object.entries(summary.by_category)) {
    if (!selected.has(cat)) continue;
    if (REVENUE_TAGS.has(cat)) {
      totalRevenue += amount;
    } else if (EXPENSE_TAGS.has(cat)) {
      totalExpenses += amount;
    }
  }

  // Recalculate by_month from filtered data
  const filteredByMonth: MonthSummary[] = summary.by_month.map((row) => {
    const expenseRow = summary.by_month_expense.find((e) => e.month === row.month);
    let monthExpenses = 0;
    if (expenseRow) {
      for (const [key, val] of Object.entries(expenseRow)) {
        if (key === "month") continue;
        if (selected.has(key) && typeof val === "number") {
          monthExpenses += val;
        }
      }
    }

    const monthRevenue = includesRevenue ? row.revenue : 0;
    return {
      month: row.month,
      revenue: monthRevenue,
      expenses: monthExpenses,
      profit: monthRevenue - monthExpenses,
    };
  });

  // Property sections always stay visible — they show totals regardless of category filter
  // Property filtering is handled server-side via property_ids param
  return {
    revenue: totalRevenue,
    expenses: totalExpenses,
    profit: totalRevenue - totalExpenses,
    by_category: filteredByCategory,
    by_month: filteredByMonth,
    by_month_expense: filteredByMonthExpense,
    by_property: summary.by_property,
    by_property_month: summary.by_property_month,
  };
}

export function useDashboardFilter(summary: SummaryResponse | undefined): UseDashboardFilterReturn {
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set(ALL_DASHBOARD_CATEGORIES),
  );

  const preset = useMemo(() => detectPreset(selectedCategories), [selectedCategories]);

  const isFiltered = useMemo(() => {
    return !setsEqual(selectedCategories, ALL_DASHBOARD_CATEGORIES);
  }, [selectedCategories]);

  const toggleCategory = useCallback((category: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      // If removing the last category, reset to all instead of blocking
      if (next.size === 0) return new Set(ALL_DASHBOARD_CATEGORIES);
      return next;
    });
  }, []);

  const selectOnly = useCallback((category: string) => {
    setSelectedCategories((prev) => {
      const isIncome = REVENUE_TAGS.has(category);
      const isExpense = EXPENSE_TAGS.has(category);
      const next = new Set<string>();
      // Keep the other group's current selections
      for (const cat of prev) {
        if (isIncome && EXPENSE_TAGS.has(cat)) next.add(cat);
        if (isExpense && REVENUE_TAGS.has(cat)) next.add(cat);
      }
      // Select only the clicked category within its group
      next.add(category);
      return next;
    });
  }, []);

  const setPreset = useCallback((newPreset: CategoryFilterPreset) => {
    setSelectedCategories(getCategoriesForPreset(newPreset));
  }, []);

  const resetCategories = useCallback(() => {
    setSelectedCategories(new Set(ALL_DASHBOARD_CATEGORIES));
  }, []);

  const filteredSummary = useMemo(() => {
    if (!summary) return undefined;
    if (!isFiltered) return summary as FilteredSummary;
    return filterByCategory(summary, selectedCategories);
  }, [summary, selectedCategories, isFiltered]);

  return {
    filterState: { selectedCategories, preset },
    filteredSummary,
    toggleCategory,
    selectOnly,
    setPreset,
    resetCategories,
    isFiltered,
  };
}
