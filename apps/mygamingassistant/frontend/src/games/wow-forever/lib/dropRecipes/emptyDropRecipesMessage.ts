import { DROP_RECIPES_TEXT } from "@/games/wow-forever/data/dropRecipes/dropRecipesConfig";
import { RECIPE_PROFESSION_LABELS } from "@/games/wow-forever/data/recipes/recipesConfig";
import { selectDropRecipes } from "@/games/wow-forever/lib/dropRecipes/selectDropRecipes";
import type { DropRecipe } from "@/games/wow-forever/types/dropRecipes/dropRecipe";
import type { DropRecipeFilters } from "@/games/wow-forever/types/dropRecipes/dropRecipeFilters";

/**
 * The note when no recipe matches. When the profession has none of the picked trade kind at all (Alchemy has
 * no bind-on-pickup drop-only recipe), say why instead of pointing at the other filters.
 */
export function emptyDropRecipesMessage(
  recipes: readonly DropRecipe[],
  filters: Pick<DropRecipeFilters, "profession" | "source" | "sort" | "trade">,
): string {
  const { trade } = filters;
  const count = (t: DropRecipeFilters["trade"]) => selectDropRecipes(recipes, { ...filters, source: null, trade: t }).length;
  // Only when the profession has drop-only recipes at all: otherwise "every one binds" would be vacuous.
  if (trade !== null && count(trade) === 0 && count(null) > 0) {
    return DROP_RECIPES_TEXT.noneForTrade[trade](RECIPE_PROFESSION_LABELS[filters.profession]);
  }
  return DROP_RECIPES_TEXT.empty;
}
