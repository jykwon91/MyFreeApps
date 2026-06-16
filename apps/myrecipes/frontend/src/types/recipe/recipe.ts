import type { VersionResponse } from "@/types/recipe/version";

/** List-view recipe: identity plus rollups, no version bodies. */
export interface RecipeSummary {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
  version_count: number;
  latest_version_number: number | null;
  best_rating: number | null;
  last_cooked_at: string | null;
}

/** Detail-view recipe: the summary plus the full latest version. */
export interface RecipeDetailResponse extends RecipeSummary {
  latest_version: VersionResponse | null;
}
