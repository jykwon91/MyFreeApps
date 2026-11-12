import type { DiffEntryPoint } from "../types/DiffEntryPoint";
import type { RecipeEntryPoint } from "../types/RecipeEntryPoint";
import type { TweakEntryPoint } from "../types/TweakEntryPoint";

export const RECIPES_BACK_TITLE = "Recipes";

/** Back's title on a screen opened from a recipe, which goes back to it. */
export const RECIPE_BACK_TITLE = "Recipe";

/** What a recipe screen's Back button says when it was opened from somewhere other than Recipes. */
export const ENTRY_POINT_BACK_TITLES: Record<RecipeEntryPoint, string> = {
  discover: "Discover",
};

/** What a diff's Back button says when it was opened from somewhere in the app; a link has Recipes behind it. */
export const DIFF_ENTRY_POINT_BACK_TITLES: Record<DiffEntryPoint, string> = {
  versions: "Versions",
};

/** What the tweak form's Back button says when it was opened from somewhere other than the recipe. */
export const TWEAK_ENTRY_POINT_BACK_TITLES: Record<TweakEntryPoint, string> = {
  diff: "Changes",
};
