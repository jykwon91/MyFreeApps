import type { VersionResponse, VersionSummary } from "@myrecipes/api-client/types/recipe/version";

export interface VersionContentProps {
  version: VersionResponse;
  /** Its timeline entry, for the owner's cooks and best rating; undefined until the version list loads. */
  summary: VersionSummary | undefined;
  recipeId: string;
  isLatest: boolean;
  /** Only the owner logs cooks. */
  isOwner: boolean;
}
