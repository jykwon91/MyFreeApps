import { ENTRY_POINT_BACK_TITLES, RECIPES_BACK_TITLE } from "../constants/backTitles";
import type { RecipeEntryPoint } from "../types/RecipeEntryPoint";

/** Back's title on a recipe screen, from the `from` route param it was opened with. */
export function recipeBackTitle(from: string | undefined): string {
  // Own keys only: a param like "constructor" would otherwise match the object's prototype.
  return from && Object.hasOwn(ENTRY_POINT_BACK_TITLES, from) ? ENTRY_POINT_BACK_TITLES[from as RecipeEntryPoint] : RECIPES_BACK_TITLE;
}
