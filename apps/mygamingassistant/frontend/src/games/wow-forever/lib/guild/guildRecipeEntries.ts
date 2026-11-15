import { guideProfession, recipeSpell } from "@/games/wow-forever/lib/character/characterProfessions";
import { normalizeItemName } from "@/games/wow-forever/lib/itemSearch";
import type { GuildRecipe } from "@/games/wow-forever/types/guild/guildRecipe";
import type { RecipeEntryLookup } from "@/games/wow-forever/types/guild/recipeEntryLookup";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

function nameKey(profession: string, name: string): string {
  return `${profession}:name:${normalizeItemName(name)}`;
}

/** The Recipes page's entries, findable by recipe spell and by name within a profession. */
export function recipeEntryLookup(entries: readonly RecipeEntry[]): RecipeEntryLookup {
  const lookup = new Map<string, RecipeEntry>();
  for (const entry of entries) {
    lookup.set(entry.key, entry);
    const byName = nameKey(entry.profession, entry.name);
    if (!lookup.has(byName)) lookup.set(byName, entry);
  }
  return lookup;
}

/**
 * Our recipe data for a guild recipe: by its spell (Blizzard's recipe id mapped through
 * `recipeSpells.json`), else by name in its profession (Cooking is keyed by the food, not a spell).
 * Null for a profession or recipe our data doesn't have.
 */
export function guildRecipeEntry(recipe: Pick<GuildRecipe, "id" | "name" | "profession_id">, lookup: RecipeEntryLookup): RecipeEntry | null {
  const profession = guideProfession(recipe.profession_id);
  if (profession === null) return null;
  const spell = recipeSpell(recipe.id);
  const bySpell = spell === null ? undefined : lookup.get(`${profession}:${spell}`);
  return bySpell ?? lookup.get(nameKey(profession, recipe.name)) ?? null;
}
