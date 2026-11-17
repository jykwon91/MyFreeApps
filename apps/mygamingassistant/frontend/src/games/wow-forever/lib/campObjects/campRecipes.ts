import type { CraftRecipe } from "@/games/wow-forever/types/crafting";

/** A profession's camp objects, smallest first (by the skill they turn yellow at, then name). */
export function campRecipes(recipes: readonly CraftRecipe[]): CraftRecipe[] {
  return recipes.filter((r) => r.camp).sort((a, b) => a.yellow - b.yellow || a.name.localeCompare(b.name) || a.spell - b.spell);
}
