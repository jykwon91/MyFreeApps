import { loadAllCraftingData } from "@/games/wow-forever/crafting/loadCraftingData";
import { buildDropRecipes } from "@/games/wow-forever/lib/dropRecipes/buildDropRecipes";
import type { DropRecipe } from "@/games/wow-forever/types/dropRecipes/dropRecipe";

let cached: Promise<readonly DropRecipe[]> | null = null;

/** Every drop-only recipe, built once (a failed load is tried again next time). */
export function loadDropRecipes(): Promise<readonly DropRecipe[]> {
  if (!cached) {
    cached = loadAllCraftingData()
      .then(buildDropRecipes)
      .catch((error: unknown) => {
        cached = null;
        throw error;
      });
  }
  return cached;
}
