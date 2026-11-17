import { isNoResponse } from "@platform/core/utils/isNoResponse";
import { isNotFound } from "@platform/core/utils/isNotFound";
import { writeOutcome } from "@platform/core/utils/writeOutcome";
import { APPLICATION_DETAIL_MESSAGES } from "../constants/applicationDetail";
import { unsureSavedMessage, WRITE_FAILURE_MESSAGES } from "../constants/writeFailure";
import type { CreateFailureCopy } from "../types/CreateFailureCopy";

/** What to say when a change or delete fails: that the server can't be reached, that the thing is gone (a 404), or else offer a retry. */
export function writeFailure(error: unknown, failed: string, gone: string = APPLICATION_DETAIL_MESSAGES.gone): string {
  if (isNoResponse(error)) return WRITE_FAILURE_MESSAGES.offline;
  return isNotFound(error) ? gone : failed;
}

/**
 * What to say when an add fails. Unlike a change, an add isn't safe to send twice: after a lost answer or a server failure
 * with no reason it may already be saved, so this says to check first rather than offering a plain retry.
 */
export function createFailure(error: unknown, { failed, checkWhere, gone }: CreateFailureCopy): string {
  if (writeOutcome(error) === "unknown") return unsureSavedMessage(checkWhere, isNoResponse(error));
  return gone && isNotFound(error) ? gone : failed;
}
