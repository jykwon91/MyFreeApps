import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { RECIPE_PROFESSIONS } from "@/games/wow-forever/data/recipes/recipesConfig";
import type { RecipeProfession } from "@/games/wow-forever/types/recipes/recipeProfession";

/** The profession as one the Recipes page lists, or null (Mining, Herbalism, Skinning, Fishing have no recipes there). */
export function recipeProfession(profession: GuideProfession | null): RecipeProfession | null {
  return RECIPE_PROFESSIONS.find((p) => p === profession) ?? null;
}
