import type { IngredientResponse } from "@/types/recipe/ingredient";
import type { StepResponse } from "@/types/recipe/step";

/** Full version: metadata plus the snapshot of ingredients and steps. */
export interface VersionResponse {
  id: string;
  recipe_id: string;
  version_number: number;
  parent_version_id: string | null;
  change_note: string | null;
  servings: string | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  created_at: string;
  ingredients: IngredientResponse[];
  steps: StepResponse[];
}

/** Timeline entry — lightweight, no ingredient/step bodies. */
export interface VersionSummary {
  id: string;
  version_number: number;
  change_note: string | null;
  created_at: string;
  cook_count: number;
  best_rating: number | null;
}
