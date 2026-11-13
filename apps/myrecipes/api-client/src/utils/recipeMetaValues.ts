import type { RecipeDetailResponse } from "../types/recipe/recipe";
import type { RecipeMetaValues } from "../types/recipe/recipe-meta-values";

/** The edit form's starting values: the recipe's details as saved, with a missing one as "". */
export function recipeMetaValues(recipe: Pick<RecipeDetailResponse, "title" | "description" | "source">): RecipeMetaValues {
  return { title: recipe.title, description: recipe.description ?? "", source: recipe.source ?? "" };
}
