import type { CategoryPreset } from "@mybookkeeper/api-client/types/analytics/category-preset";
import { ALL_SUMMARY_CATEGORIES, detectCategoryPreset, isCategoryFilterActive } from "@mybookkeeper/api-client/utils/categoryFilter";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";

export const CATEGORY_PRESETS: readonly { key: CategoryPreset; label: string }[] = [
  { key: "all", label: MESSAGES.allCategories },
  { key: "income", label: MESSAGES.incomeOnly },
  { key: "expenses", label: MESSAGES.expensesOnly },
];

/** What the category picker shows as its value. */
export function categoriesValue(selected: ReadonlySet<string>): string {
  if (!isCategoryFilterActive(selected)) return MESSAGES.allCategories;
  const preset = detectCategoryPreset(selected);
  if (preset === "income") return MESSAGES.incomeOnly;
  if (preset === "expenses") return MESSAGES.expensesOnly;
  return MESSAGES.nCategories(selected.size, ALL_SUMMARY_CATEGORIES.size);
}
