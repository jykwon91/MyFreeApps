import type { RecipeEntryPoint } from "../types/RecipeEntryPoint";

export const RECIPES_BACK_TITLE = "Recipes";

/** Back's title on a screen opened from a recipe, which goes back to it. */
export const RECIPE_BACK_TITLE = "Recipe";

/** What a recipe screen's Back button says when it was opened from somewhere other than Recipes. */
export const ENTRY_POINT_BACK_TITLES: Record<RecipeEntryPoint, string> = {
  discover: "Discover",
};
