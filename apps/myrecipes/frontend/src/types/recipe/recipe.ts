import type { VersionResponse } from "@/types/recipe/version";

/**
 * List-view recipe: identity plus rollups, no version bodies.
 *
 * Public-read / auth-write: recipe reads are public, so the response no longer
 * carries the owner's ``user_id``. Instead it carries ``is_owner`` (whether the
 * current viewer owns this recipe) and ``owner_display_name`` (attribution for
 * everyone else). The owner-only rollups ``best_rating`` and ``last_cooked_at``
 * are ``null`` for non-owners — the backend omits them so private cook history
 * never leaks.
 */
export interface RecipeSummary {
  id: string;
  title: string;
  description: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
  version_count: number;
  latest_version_number: number | null;
  /** Best cook rating across versions — ``null`` for non-owners (private). */
  best_rating: number | null;
  /** When this recipe was last cooked — ``null`` for non-owners (private). */
  last_cooked_at: string | null;
  /** True when the current viewer owns this recipe (drives write affordances). */
  is_owner: boolean;
  /** Display name of the owner, for "by {name}" attribution. Empty when unknown. */
  owner_display_name: string;
}

/** Detail-view recipe: the summary plus the full latest version. */
export interface RecipeDetailResponse extends RecipeSummary {
  latest_version: VersionResponse | null;
}
