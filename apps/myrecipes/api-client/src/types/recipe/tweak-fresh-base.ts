import type { ApiError } from "@platform/core/types/api-error";
import type { SerializedError } from "@reduxjs/toolkit";
import type { RecipeDetailResponse } from "./recipe";
import type { TweakBase } from "./tweak-base";

/** What a tweak screen needs from loading the recipe it starts from. */
export interface TweakFreshBase {
  /** The recipe and version the tweak starts from; null until an answer fetched after opening has a version. */
  base: TweakBase | null;
  /** The answer fetched after opening, if any; may have no latest version. */
  freshRecipe: RecipeDetailResponse | undefined;
  /** The load failed since opening (a failure cached from before doesn't count). */
  hasFailed: boolean;
  error: ApiError | SerializedError | undefined;
  refetch: () => unknown;
}
