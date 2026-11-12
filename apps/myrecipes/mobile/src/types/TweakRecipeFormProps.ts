import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";

export interface TweakRecipeFormProps {
  recipe: RecipeDetailResponse;
  /** The version the tweak starts from: the recipe's latest, as loaded when the screen opened. */
  version: VersionResponse;
}
