import type { CategoryPreset } from "@mybookkeeper/api-client/types/analytics/category-preset";

export type CategoryFilterPreset = CategoryPreset;

export interface CategoryFilterState {
  selectedCategories: Set<string>;
  preset: CategoryFilterPreset;
}
