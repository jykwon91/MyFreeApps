import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";

export interface VersionContentProps {
  version: VersionResponse;
  recipeId: string;
  isLatest: boolean;
  /** Only the owner logs cooks. */
  isOwner: boolean;
}
