import { normalizeItemName } from "@/games/wow-forever/lib/itemSearch";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";
import type { RecipeEntryLookup } from "@/games/wow-forever/types/recipes/recipeEntryLookup";
import type { RecipeProfession } from "@/games/wow-forever/types/recipes/recipeProfession";

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

/** A recipe's entry by its spell, else by name in its profession (Cooking is keyed by the food, not a spell); null when we don't have it. */
export function findRecipeEntry(lookup: RecipeEntryLookup, profession: RecipeProfession, spell: number | null, name: string): RecipeEntry | null {
  const bySpell = spell === null ? undefined : lookup.get(`${profession}:${spell}`);
  return bySpell ?? lookup.get(nameKey(profession, name)) ?? null;
}
