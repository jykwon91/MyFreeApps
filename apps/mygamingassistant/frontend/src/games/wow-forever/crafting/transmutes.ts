import type { CraftRecipe } from "@/games/wow-forever/types/crafting";

/** The client names every transmute "Transmute: …". */
export const TRANSMUTE_PREFIX = "Transmute: ";

/** Transmute recipes, lowest skill first. */
export function transmutes(recipes: readonly CraftRecipe[]): CraftRecipe[] {
  return recipes.filter((r) => r.name.startsWith(TRANSMUTE_PREFIX)).sort((a, b) => a.yellow - b.yellow || a.name.localeCompare(b.name));
}
