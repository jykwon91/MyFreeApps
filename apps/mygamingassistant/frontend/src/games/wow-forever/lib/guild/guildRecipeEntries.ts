import { guideProfession, recipeSpell } from "@/games/wow-forever/lib/character/characterProfessions";
import { findRecipeEntry } from "@/games/wow-forever/lib/recipes/recipeEntryLookup";
import { recipeProfession } from "@/games/wow-forever/lib/recipes/recipeProfession";
import type { GuildRecipe } from "@/games/wow-forever/types/guild/guildRecipe";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";
import type { RecipeEntryLookup } from "@/games/wow-forever/types/recipes/recipeEntryLookup";

/**
 * Our recipe data for a guild recipe: by its spell (Blizzard's recipe id mapped through
 * `recipeSpells.json`), else by name in its profession. Null for a profession or recipe our data doesn't have.
 */
export function guildRecipeEntry(recipe: Pick<GuildRecipe, "id" | "name" | "profession_id">, lookup: RecipeEntryLookup): RecipeEntry | null {
  const profession = recipeProfession(guideProfession(recipe.profession_id));
  if (profession === null) return null;
  return findRecipeEntry(lookup, profession, recipeSpell(recipe.id), recipe.name);
}
