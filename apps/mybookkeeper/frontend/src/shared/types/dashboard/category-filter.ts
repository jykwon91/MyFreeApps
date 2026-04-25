export type CategoryFilterPreset = "all" | "income" | "expenses";

export interface CategoryFilterState {
  selectedCategories: Set<string>;
  preset: CategoryFilterPreset;
}
