import { REVENUE_TAGS, EXPENSE_TAGS, TAG_OPTIONS } from "./constants";
import type { CategoryFilterPreset } from "@/shared/types/dashboard/category-filter";

/** All categories available for dashboard filtering */
export const ALL_DASHBOARD_CATEGORIES = new Set<string>(TAG_OPTIONS);

/** Category groups for the filter bar UI */
export const INCOME_CATEGORY_LIST: readonly string[] = [...REVENUE_TAGS];
export const EXPENSE_CATEGORY_LIST_FILTER: readonly string[] = [...EXPENSE_TAGS];

/** Preset definitions mapping preset name to the set of categories */
export function getCategoriesForPreset(preset: CategoryFilterPreset): Set<string> {
  switch (preset) {
    case "all":
      return new Set(ALL_DASHBOARD_CATEGORIES);
    case "income":
      return new Set(REVENUE_TAGS);
    case "expenses":
      return new Set(EXPENSE_TAGS);
  }
}
