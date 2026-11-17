import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { DropRecipe } from "@/games/wow-forever/types/dropRecipes/dropRecipe";
import type { DropRecipeFilters } from "@/games/wow-forever/types/dropRecipes/dropRecipeFilters";
import { DROP_RECIPE_SORT } from "@/games/wow-forever/types/dropRecipes/dropRecipeSort";
import { DROP_RECIPE_TRADE, type DropRecipeTrade } from "@/games/wow-forever/types/dropRecipes/dropRecipeTrade";

function bySkill(a: DropRecipe, b: DropRecipe): number {
  return a.skill - b.skill || a.name.localeCompare(b.name);
}

/** Best chance per kill first; random-only drops (no chance worth quoting) last. */
function byOdds(a: DropRecipe, b: DropRecipe): number {
  return b.bestChance - a.bestChance || bySkill(a, b);
}

function matchesTrade(recipe: DropRecipe, trade: DropRecipeTrade): boolean {
  return recipe.bindOnPickup === (trade === DROP_RECIPE_TRADE.bindOnPickup);
}

/** The profession's drop-only recipes that match the source and trade filters, in the chosen order. */
export function selectDropRecipes(recipes: readonly DropRecipe[], filters: Pick<DropRecipeFilters, "profession" | "source" | "sort" | "trade">): DropRecipe[] {
  const { profession, source, sort, trade } = filters;
  const shown = recipes.filter(
    (r) => r.profession === profession && (source === null || r.sources.includes(source)) && (trade === null || matchesTrade(r, trade)),
  );
  return shown.sort(sort === DROP_RECIPE_SORT.odds ? byOdds : bySkill);
}

/** The professions that have any drop-only recipe, in the given order. */
export function dropRecipeProfessions(recipes: readonly DropRecipe[], order: readonly CraftingProfession[]): CraftingProfession[] {
  const present = new Set(recipes.map((r) => r.profession));
  return order.filter((p) => present.has(p));
}
