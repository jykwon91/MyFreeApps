import { useSyncExternalStore } from "react";
import { loadRecipeBook } from "@/games/wow-forever/lib/recipes/loadRecipeBook";
import { recipeEntryLookup } from "@/games/wow-forever/lib/recipes/recipeEntryLookup";
import type { RecipeEntryLookup } from "@/games/wow-forever/types/recipes/recipeEntryLookup";

let lookup: RecipeEntryLookup | null = null;
let loading = false;
const listeners = new Set<() => void>();

function load(): void {
  if (lookup || loading) return;
  loading = true;
  loadRecipeBook().then(
    (entries) => {
      lookup = recipeEntryLookup(entries);
      listeners.forEach((notify) => notify());
    },
    // Recipe names just stay plain text; the next component to mount tries again.
    () => {
      loading = false;
    },
  );
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  load();
  return () => listeners.delete(notify);
}

/**
 * Every recipe, findable by spell or name, shared by every recipe name on the page (one load, one lookup).
 * Null until the recipe book has loaded.
 */
export function useRecipeLookup(): RecipeEntryLookup | null {
  return useSyncExternalStore(subscribe, () => lookup, () => null);
}
