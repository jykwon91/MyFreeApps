import type { CraftingFile, CraftRecipe } from "@/games/wow-forever/types/crafting";

/**
 * What a recipe's item is for: its tooltip line from the Forever client, or —
 * for parts with no tooltip (tubes, bolts, blasting powder) — that other
 * recipes of the profession take it. Null when the data says neither; never
 * guessed.
 */
export function effectText(recipe: CraftRecipe, file: Pick<CraftingFile, "recipes">, professionLabel: string): string | null {
  if (recipe.effect) return recipe.effect;
  const made = recipe.creates?.id;
  if (made === undefined) return null;
  const isPart = file.recipes.some((r) => r.spell !== recipe.spell && r.reagents.some((x) => x.id === made));
  return isPart ? `A part for other ${professionLabel} recipes.` : null;
}
