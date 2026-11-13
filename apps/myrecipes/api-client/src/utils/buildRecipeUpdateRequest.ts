import type { RecipeMetaValues } from "../types/recipe/recipe-meta-values";
import type { RecipeUpdateRequest } from "../types/recipe/recipe-requests";

/** PATCH /recipes/{id}'s body from the edit form, trimmed, with a blank description or source sent as null. */
export function buildRecipeUpdateRequest(values: RecipeMetaValues): RecipeUpdateRequest {
  return {
    title: values.title.trim(),
    description: values.description.trim() || null,
    source: values.source.trim() || null,
  };
}
