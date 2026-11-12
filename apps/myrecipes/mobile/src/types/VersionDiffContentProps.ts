import type { DiffResponse } from "@myrecipes/api-client/types/recipe/diff";

export interface VersionDiffContentProps {
  diff: DiffResponse;
  recipeId: string;
  isOwner: boolean;
}
