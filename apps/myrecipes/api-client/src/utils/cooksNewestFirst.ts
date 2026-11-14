import type { CookLogResponse } from "../types/recipe/cook-log";

/** Cook logs newest first by when they were cooked, as the recipe page lists them. */
export function cooksNewestFirst(cooks: readonly CookLogResponse[]): CookLogResponse[] {
  return [...cooks].sort((a, b) => new Date(b.cooked_at).getTime() - new Date(a.cooked_at).getTime());
}
