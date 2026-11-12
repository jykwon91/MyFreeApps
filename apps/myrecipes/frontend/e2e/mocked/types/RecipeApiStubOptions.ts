import type { CookLogResponse } from "@myrecipes/api-client/types/recipe/cook-log";

export interface RecipeApiStubOptions {
  /** Whether the signed-in user owns the recipe; the cook-log endpoints answer 404 to anyone else. */
  isOwner?: boolean;
  /** How many versions the recipe has; the last is the latest. */
  versionCount?: number;
  /** Cook logs the recipe starts with. */
  cooks?: CookLogResponse[];
  /** Status a write answers instead of succeeding, keyed `${method} ${path after /recipes/:id}` (the recipe itself is "/"). */
  failWith?: Record<string, number>;
}
