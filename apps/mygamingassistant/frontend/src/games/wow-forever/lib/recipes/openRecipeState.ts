import type { OpenRecipeState } from "@/games/wow-forever/types/recipes/openRecipeState";

/** True when `location.state` asks the Recipes page to open the recipe named in the search. */
export function wantsOpenRecipe(state: unknown): boolean {
  return typeof state === "object" && state !== null && (state as Partial<OpenRecipeState>).openRecipe === true;
}
