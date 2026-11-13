import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";
import type { CookLogResponse } from "@myrecipes/api-client/types/recipe/cook-log";

export interface RecipeApiStubOptions {
  /**
   * A stored recipe to start from; without it the stub builds a fixture recipe. Its latest_version is the
   * only version unless `versions` is given. For an owner, best_rating and last_cooked_at are recomputed
   * from the cook logs on every read (as the backend does), so the seed's values for them are not served.
   */
  recipe?: RecipeDetailResponse;
  /** Every version the recipe starts with, oldest first (the last is the latest); overrides the fixture versions. */
  versions?: VersionResponse[];
  /** Whether the signed-in user owns the recipe (default: the seed recipe's is_owner, else true); the cook-log endpoints answer 404 to anyone else. */
  isOwner?: boolean;
  /** How many versions the recipe has; the last is the latest. */
  versionCount?: number;
  /** Cook logs the recipe starts with. */
  cooks?: CookLogResponse[];
  /** Status a write answers instead of succeeding, keyed `${method} ${path after /recipes/:id}` (the recipe itself is "/"). */
  failWith?: Record<string, number>;
}
