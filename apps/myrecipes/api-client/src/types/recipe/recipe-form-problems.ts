import type { IngredientRowProblems } from "./ingredient-row-problems";

/**
 * What stops a recipe form saving. `rows` and `stepRows` are keyed by a row's `key`, for the
 * field that's wrong in that row. Empty (no keys, empty records) when the form can be saved.
 */
export interface RecipeFormProblems {
  title?: string;
  description?: string;
  source?: string;
  servings?: string;
  prepMinutes?: string;
  cookMinutes?: string;
  ingredients?: string;
  steps?: string;
  rows: Record<string, IngredientRowProblems>;
  stepRows: Record<string, string>;
}
