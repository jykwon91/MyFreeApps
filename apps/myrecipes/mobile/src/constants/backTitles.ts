import type { RecipeEntryPoint } from "../types/RecipeEntryPoint";

export const RECIPES_BACK_TITLE = "Recipes";

/** What a recipe screen's Back button says when it was opened from somewhere other than Recipes. */
export const ENTRY_POINT_BACK_TITLES: Record<RecipeEntryPoint, string> = {
  discover: "Discover",
};
