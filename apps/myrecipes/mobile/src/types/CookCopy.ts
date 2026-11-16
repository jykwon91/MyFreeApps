import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";

/** A recipe as cook mode last opened it, saved so it can open again without a connection. */
export interface CookCopy {
  owner: string;
  recipeId: string;
  title: string;
  version: VersionResponse;
  savedAt: number;
}
