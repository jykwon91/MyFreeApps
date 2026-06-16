import type { IngredientInput } from "@/types/recipe/ingredient";
import type { StepInput } from "@/types/recipe/step";

/** Create a recipe together with its first version (v1) in one call. */
export interface RecipeCreateRequest {
  title: string;
  description?: string | null;
  source?: string | null;
  servings?: string | null;
  prep_minutes?: number | null;
  cook_minutes?: number | null;
  ingredients: IngredientInput[];
  steps: StepInput[];
}

/**
 * Patch recipe-level metadata only. Ingredients/steps never change in place —
 * that is what a tweak (a new version) is for.
 */
export interface RecipeUpdateRequest {
  title?: string;
  description?: string | null;
  source?: string | null;
}

/** Body for POST /recipes/{id}/versions — a tweak that creates a new version. */
export interface VersionCreateRequest {
  base_version_id?: string | null;
  change_note?: string | null;
  servings?: string | null;
  prep_minutes?: number | null;
  cook_minutes?: number | null;
  ingredients: IngredientInput[];
  steps: StepInput[];
}
