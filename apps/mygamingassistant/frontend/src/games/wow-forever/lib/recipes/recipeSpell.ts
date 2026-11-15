import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

/** A crafting recipe's spell id, from its `${profession}:${spell}` key. */
export function recipeSpell(entry: Pick<RecipeEntry, "key">): number {
  return Number(entry.key.split(":")[1]);
}
