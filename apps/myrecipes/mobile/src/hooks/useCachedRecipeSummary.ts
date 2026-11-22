import { recipesApi } from "@myrecipes/api-client/store/recipesApi";
import type { RecipeSummary } from "@myrecipes/api-client/types/recipe/recipe";
import { useSelector } from "react-redux";
import type { RootState } from "../lib/store";

function findCachedSummary(state: RootState, recipeId: string): RecipeSummary | undefined {
  for (const args of recipesApi.util.selectCachedArgsForQuery(state, "listRecipes")) {
    const pages = recipesApi.endpoints.listRecipes.select(args)(state).data?.pages ?? [];
    for (const page of pages) {
      const found = page.items.find((recipe) => recipe.id === recipeId);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * The recipe's row from a list or search the app already loaded, so its screen can open with the
 * title and owner at once. Display text only ever comes from here, never from the link that opened
 * the screen, which anyone can write.
 */
export function useCachedRecipeSummary(recipeId: string): RecipeSummary | undefined {
  return useSelector((state: RootState) => findCachedSummary(state, recipeId));
}
