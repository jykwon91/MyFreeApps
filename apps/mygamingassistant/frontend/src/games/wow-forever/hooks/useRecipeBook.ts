import { useEffect, useState } from "react";
import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import { loadRecipeBook } from "@/games/wow-forever/lib/recipes/loadRecipeBook";
import type { RecipeBookState } from "@/games/wow-forever/types/recipes/recipeBookState";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

// The browser remembers a module import that failed and won't fetch it again, so a retry reloads the page.
const reloadPage = () => window.location.reload();

/** Every recipe, crafting and Cooking, joined once for the Recipes page. */
export function useRecipeBook(): RecipeBookState {
  const [entries, setEntries] = useState<readonly RecipeEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadRecipeBook().then(
      (loaded) => live && setEntries(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  if (entries) return { status: LOAD_STATUS.ready, entries };
  if (failed) return { status: LOAD_STATUS.error, retry: reloadPage };
  return { status: LOAD_STATUS.loading };
}
