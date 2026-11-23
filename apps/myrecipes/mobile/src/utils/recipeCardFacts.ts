import type { RecipeSummary } from "@myrecipes/api-client/types/recipe/recipe";
import { RECIPE_BYLINE } from "@myrecipes/api-client/constants/recipeByline";
import type { RecipeCardFacts } from "../types/RecipeCardFacts";
import { formatCount } from "@platform/core/utils/count";

/** The version count and owner line a card shows and its spoken label repeats. */
export function recipeCardFacts(recipe: RecipeSummary): RecipeCardFacts {
  return {
    versions: recipe.version_count > 0 ? formatCount(recipe.version_count, "version") : null,
    owner: recipe.owner_display_name ? RECIPE_BYLINE.byOwner(recipe.owner_display_name) : null,
  };
}
