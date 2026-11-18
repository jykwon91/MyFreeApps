import { getApiValidationDetail } from "@platform/core/utils/apiValidationDetail";
import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";
import { isNoResponse } from "@platform/core/utils/isNoResponse";
import { writeOutcome } from "@platform/core/utils/writeOutcome";
import { CONNECTION_MESSAGES } from "../constants/connectionCopy";
import { RECIPE_WRITE_FALLBACKS, RECIPE_WRITE_MESSAGES, RECIPE_WRITE_OVERRIDES, RECIPE_WRITE_UNSURE } from "../constants/recipeWriteErrors";
import type { RecipeWriteAction } from "../types/recipe/recipe-write-action";
import { requestErrorStatus } from "./requestErrorStatus";

/**
 * What to tell the user when saving a recipe, a tweak or a cook log fails: that a new one may have saved anyway,
 * offline, signed out, not allowed, too large, slowed down, the server's own reason for refusing (422), or server trouble.
 * Null when a cache reset (sign-out, account change) called the request off: there's nobody left to tell.
 */
export function recipeWriteErrorMessage(error: unknown, action: RecipeWriteAction): string | null {
  if (isCancelledRequest(error)) return null;
  const fallback = RECIPE_WRITE_FALLBACKS[action];
  const override = RECIPE_WRITE_OVERRIDES[action];
  const unsure = RECIPE_WRITE_UNSURE[action];
  if (unsure && writeOutcome(error) === "unknown") return unsure;
  if (isNoResponse(error)) return CONNECTION_MESSAGES.write;
  const status = requestErrorStatus(error);
  switch (status) {
    // 400: the base version isn't one of this recipe's. 404: the recipe is gone, or not this account's.
    case 400:
    case 404:
      return override?.changedOrGone ?? fallback;
    case 401:
      return override?.signedOut ?? RECIPE_WRITE_MESSAGES.signedOut;
    case 403:
      return RECIPE_WRITE_MESSAGES.forbidden;
    case 413:
      return RECIPE_WRITE_MESSAGES.tooLarge;
    case 422:
      return getApiValidationDetail(error, override?.invalid ?? fallback);
    case 429:
      return RECIPE_WRITE_MESSAGES.slowDown;
    default:
      return status !== undefined && status >= 500 ? RECIPE_WRITE_MESSAGES.serverTrouble : fallback;
  }
}
