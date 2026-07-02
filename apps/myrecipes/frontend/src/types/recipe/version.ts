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

/**
 * Timeline entry — lightweight, no ingredient/step bodies.
 *
 * Public-read / auth-write: the per-version cook rollups ``cook_count`` and
 * ``best_rating`` are owner-only, so the backend returns ``null`` for both to
 * non-owners. The timeline renders for everyone (version history is public) but
 * omits these rollups when they're ``null``.
 */
export interface VersionSummary {
  id: string;
  version_number: number;
  change_note: string | null;
  created_at: string;
  /** Number of logged cooks — ``null`` for non-owners (private). */
  cook_count: number | null;
  /** Best cook rating for this version — ``null`` for non-owners (private). */
  best_rating: number | null;
}
