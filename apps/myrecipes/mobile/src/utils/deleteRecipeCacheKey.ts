import { DELETE_RECIPE_CACHE_KEY_PREFIX } from "../constants/manageRecipe";

/** The cache key a recipe's delete is tracked under, shared by the Delete button and the recipe screen. */
export function deleteRecipeCacheKey(recipeId: string): string {
  return `${DELETE_RECIPE_CACHE_KEY_PREFIX}${recipeId}`;
}
