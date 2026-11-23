import { isNoResponse } from "@platform/core/utils/isNoResponse";
import { RECIPES_LIST_ERROR_COPY } from "../constants/recipesListCopy";

/** What to tell the user when the recipes list can't be loaded. */
export function recipesListErrorMessage(error: unknown): string {
  return isNoResponse(error) ? RECIPES_LIST_ERROR_COPY.offline : RECIPES_LIST_ERROR_COPY.server;
}
