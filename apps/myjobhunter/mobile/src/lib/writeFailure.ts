import { unsureSavedMessage } from "@myjobhunter/api-client/utils/unsureSavedMessage";
import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";
import { isNoResponse } from "@platform/core/utils/isNoResponse";
import { isNotFound } from "@platform/core/utils/isNotFound";
import { writeOutcome } from "@platform/core/utils/writeOutcome";
import { unsureRepeatableMessage } from "@platform/core/utils/unsureRepeatableMessage";
import { APPLICATION_DETAIL_MESSAGES } from "../constants/applicationDetail";
import { WRITE_FAILURE_MESSAGES } from "../constants/writeFailure";
import type { CreateFailureCopy } from "../types/CreateFailureCopy";

/**
 * What to say when a write that's harmless to send twice fails (a change, a delete, setting a value). A lost answer or a server
 * failure with no reason can come after it went through (see writeOutcome), so that isn't called a failure: it says so, and that
 * trying again is safe. Any other failure reads as `describe` says. Null when a cache reset (sign-out, account change) called it
 * off: there's nobody left to tell.
 */
export function repeatableWriteFailure(error: unknown, describe: (error: unknown) => string): string | null {
  if (isCancelledRequest(error)) return null;
  if (writeOutcome(error) === "unknown") return unsureRepeatableMessage("that went through");
  return describe(error);
}

/** repeatableWriteFailure for a change or delete: that the thing is gone (a 404), or else `failed`. */
export function writeFailure(error: unknown, failed: string, gone: string = APPLICATION_DETAIL_MESSAGES.gone): string | null {
  return repeatableWriteFailure(error, (refusal) => (isNotFound(refusal) ? gone : failed));
}

/**
 * What to say when fetching something to open fails (a download link): nothing changes on the server, so a lost answer is just
 * that the server can't be reached. Null when a cache reset called it off.
 */
export function readFailure(error: unknown, failed: string, gone: string = APPLICATION_DETAIL_MESSAGES.gone): string | null {
  if (isCancelledRequest(error)) return null;
  if (isNoResponse(error)) return WRITE_FAILURE_MESSAGES.offline;
  return isNotFound(error) ? gone : failed;
}

/**
 * What to say when moving an application to another stage fails. After a lost answer the server may have moved it, so this
 * doesn't offer a plain retry: what's on screen is read again from the server and is the truth. Null when a cache reset
 * called it off.
 */
export function moveFailure(error: unknown): string | null {
  if (isCancelledRequest(error)) return null;
  if (writeOutcome(error) === "unknown") return APPLICATION_DETAIL_MESSAGES.unsureMoved;
  return writeFailure(error, APPLICATION_DETAIL_MESSAGES.couldntMove);
}

/**
 * What to say when an add fails. Unlike a change, an add isn't safe to send twice: after a lost answer or a server failure
 * with no reason it may already be saved, so this says to check first rather than offering a plain retry. Null when a cache
 * reset called it off.
 */
export function createFailure(error: unknown, { failed, checkWhere, gone }: CreateFailureCopy): string | null {
  if (isCancelledRequest(error)) return null;
  if (writeOutcome(error) === "unknown") return unsureSavedMessage(checkWhere, isNoResponse(error));
  return gone && isNotFound(error) ? gone : failed;
}
