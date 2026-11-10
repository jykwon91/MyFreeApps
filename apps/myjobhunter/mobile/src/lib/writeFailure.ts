import { isNotFound } from "@platform/core/utils/isNotFound";
import { APPLICATION_DETAIL_MESSAGES } from "../constants/applicationDetail";

/** What to say when a save or delete fails: that the thing is gone (a 404), or else offer a retry. */
export function writeFailure(error: unknown, failed: string, gone: string = APPLICATION_DETAIL_MESSAGES.gone): string {
  return isNotFound(error) ? gone : failed;
}
