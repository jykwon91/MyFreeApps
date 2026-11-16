import { useEffect, useState } from "react";
import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import { loadDropRecipes } from "@/games/wow-forever/lib/dropRecipes/loadDropRecipes";
import type { DropRecipe } from "@/games/wow-forever/types/dropRecipes/dropRecipe";
import type { DropRecipesState } from "@/games/wow-forever/types/dropRecipes/dropRecipesState";

// The browser remembers a module import that failed and won't fetch it again, so a retry reloads the page.
const reloadPage = () => window.location.reload();

/** The drop-only recipes of every crafting profession, for the Drop-only recipes page. */
export function useDropRecipes(): DropRecipesState {
  const [recipes, setRecipes] = useState<readonly DropRecipe[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadDropRecipes().then(
      (loaded) => live && setRecipes(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  if (recipes) return { status: LOAD_STATUS.ready, recipes };
  if (failed) return { status: LOAD_STATUS.error, retry: reloadPage };
  return { status: LOAD_STATUS.loading };
}
