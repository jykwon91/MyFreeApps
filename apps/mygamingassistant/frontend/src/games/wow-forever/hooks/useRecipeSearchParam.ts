import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { RECIPE_SEARCH_PARAM } from "@/games/wow-forever/data/guild/recipeSearchConfig";
import type { RecipeSearchParam } from "@/games/wow-forever/types/guild/recipeSearchParam";

/** The recipe search kept in `?recipe=`; changing it replaces the history entry and keeps the other params. */
export function useRecipeSearchParam(): RecipeSearchParam {
  const [params, setParams] = useSearchParams();
  const recipe = params.get(RECIPE_SEARCH_PARAM) ?? "";
  const setRecipe = useCallback(
    (text: string) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (text) next.set(RECIPE_SEARCH_PARAM, text);
          else next.delete(RECIPE_SEARCH_PARAM);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return { recipe, setRecipe };
}
