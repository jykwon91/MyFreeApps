import { useState, useMemo, useCallback } from "react";
import {
  detectCategoryPreset,
  filterSummaryByCategories,
  isCategoryFilterActive,
  toggleCategory as toggleCategorySelection,
} from "@mybookkeeper/api-client/utils/categoryFilter";
import { ALL_DASHBOARD_CATEGORIES, getCategoriesForPreset } from "@/shared/lib/dashboard-filter-config";
import type { CategoryFilterPreset, CategoryFilterState } from "@/shared/types/dashboard/category-filter";
import type { SummaryResponse } from "@mybookkeeper/api-client/types/summary/summary";

interface UseDashboardFilterReturn {
  filterState: CategoryFilterState;
  filteredSummary: SummaryResponse | undefined;
  toggleCategory: (category: string) => void;
  selectOnly: (category: string) => void;
  setPreset: (preset: CategoryFilterPreset) => void;
  resetCategories: () => void;
  isFiltered: boolean;
}

export function useDashboardFilter(summary: SummaryResponse | undefined): UseDashboardFilterReturn {
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set(ALL_DASHBOARD_CATEGORIES),
  );

  const preset = useMemo(() => detectCategoryPreset(selectedCategories), [selectedCategories]);
  const isFiltered = useMemo(() => isCategoryFilterActive(selectedCategories), [selectedCategories]);

  const toggleCategory = useCallback((category: string) => {
    setSelectedCategories((prev) => toggleCategorySelection(prev, category));
  }, []);

  // "Only this one" drops every other selection, whichever group it was in.
  const selectOnly = useCallback((category: string) => {
    setSelectedCategories(new Set<string>([category]));
  }, []);

  const setPreset = useCallback((newPreset: CategoryFilterPreset) => {
    setSelectedCategories(getCategoriesForPreset(newPreset));
  }, []);

  const resetCategories = useCallback(() => {
    setSelectedCategories(new Set(ALL_DASHBOARD_CATEGORIES));
  }, []);

  const filteredSummary = useMemo(() => {
    if (!summary) return undefined;
    if (!isFiltered) return summary;
    return filterSummaryByCategories(summary, selectedCategories);
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
