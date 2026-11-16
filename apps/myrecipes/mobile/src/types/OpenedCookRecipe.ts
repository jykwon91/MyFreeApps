import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";

/** What cook mode froze on opening, and whether it came from the copy saved on the phone. */
export interface OpenedCookRecipe {
  recipeId: string;
  title: string;
  version: VersionResponse;
  isSavedCopy: boolean;
}
