import { isNoResponse } from "@platform/core/utils/isNoResponse";
import { TWEAK_MESSAGES } from "../constants/tweak";
import { CONNECTION_MESSAGES } from "../constants/connectionCopy";
import { requestErrorStatus } from "./requestErrorStatus";

/** What to tell the user when saving a tweak fails. */
export function tweakErrorMessage(error: unknown): string {
  if (isNoResponse(error)) return CONNECTION_MESSAGES.tweak;
  switch (requestErrorStatus(error)) {
    // 400: the base version isn't one of this recipe's. 404: the recipe is gone, or not this account's.
    case 400:
    case 404:
      return TWEAK_MESSAGES.changedOrNotYours;
    case 422:
      return TWEAK_MESSAGES.checkEntries;
    case 401:
      return TWEAK_MESSAGES.signInAgain;
    default:
      return TWEAK_MESSAGES.couldntSave;
  }
}
