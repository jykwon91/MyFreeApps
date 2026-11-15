import { RECIPE_PARAMS, RECIPES_PAGE_PATH } from "@/games/wow-forever/data/recipes/recipesConfig";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

/** Where a recipe's name leads: the Recipes page, searched for it in its profession, which opens it in full. Item pages only exist for gear, so crafted cloth, potions and food would dead-end there. */
export function recipeHref(entry: Pick<RecipeEntry, "name" | "profession">): string {
  const params = new URLSearchParams({ [RECIPE_PARAMS.query]: entry.name, [RECIPE_PARAMS.profession]: entry.profession });
  return `${RECIPES_PAGE_PATH}?${params.toString()}`;
}
