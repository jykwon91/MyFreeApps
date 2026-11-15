import { useState } from "react";
import { useGetRecipeQuery } from "../store/recipesApi";
import type { TweakBase } from "../types/recipe/tweak-base";
import type { TweakFreshBase } from "../types/recipe/tweak-fresh-base";
import { useErrorSinceOpening } from "./useErrorSinceOpening";

/**
 * The recipe a tweak starts from. Asked for again on opening, and only an answer fetched after
 * opening counts: a cached one may be older than a tweak made elsewhere, and saving from it would
 * silently undo that tweak. Frozen once loaded, so saving or a later refetch can't move the version
 * the tweak starts from. Shared by the web page and the phone screen.
 */
export function useTweakBase(recipeId: string): TweakFreshBase {
  const { currentData, error, isError, fulfilledTimeStamp, refetch } = useGetRecipeQuery(recipeId, {
    refetchOnMountOrArgChange: true,
  });
  const hasFailed = useErrorSinceOpening(error, isError);
  const [cachedAt] = useState(fulfilledTimeStamp);
  const freshRecipe = fulfilledTimeStamp !== cachedAt ? currentData : undefined;

  const [base, setBase] = useState<TweakBase | null>(null);
  if (!base && freshRecipe?.latest_version) setBase({ recipe: freshRecipe, version: freshRecipe.latest_version });

  return { base, freshRecipe, hasFailed, error, refetch };
}
