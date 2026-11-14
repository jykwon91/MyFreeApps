import type { CookLogResponse } from "@myrecipes/api-client/types/recipe/cook-log";

export interface CookLogRowProps {
  recipeId: string;
  cook: CookLogResponse;
  /** The cooked version's number, or undefined when it isn't worth saying. */
  versionNumber: number | undefined;
}
