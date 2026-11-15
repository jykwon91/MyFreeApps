import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";

/** The recipe a tweak is of and the version it starts from, as loaded when the screen opened. */
export interface TweakBase {
  recipe: RecipeDetailResponse;
  version: VersionResponse;
}
