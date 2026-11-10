import { WELCOME_MANUAL_MAX_SECTION_IMAGES } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import { getApiValidationDetail } from "@mybookkeeper/api-client/utils/apiValidationDetail";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { isDemoRefusal } from "@mybookkeeper/api-client/utils/isDemoRefusal";
import { WELCOME_MANUAL_FAILURE_MESSAGES as FAILURE, couldntMessage, goneMessage, limitFallback, notSureItSavedMessage, offlineMessage, photoLimitFallback } from "../../constants/welcomeManualFailures";
import { WELCOME_MANUAL_REORDER_MESSAGES } from "../../constants/welcomeManualForms";
import type { WelcomeManualItemWords } from "../../types/WelcomeManualItemWords";

const SERVER_ERROR = 500;

/**
 * What to say when adding or changing something fails. A 409 on an add is the server's own limit
 * message ("A section can have at most 20 fields"), which is written for the person, so it is shown.
 */
export function saveFailure(error: unknown, { noun, plural }: WelcomeManualItemWords, isNew: boolean): string {
  const status = httpStatus(error);
  if (status === undefined) return isNew ? notSureItSavedMessage(plural) : offlineMessage("save that. Your changes are still here");
  if (status === 403) return FAILURE.viewOnly;
  if (status === 404) return goneMessage(noun);
  if (status === 409) return getApiValidationDetail(error, limitFallback(plural));
  if (status === 422) return FAILURE.invalid;
  if (status >= SERVER_ERROR && isNew) return notSureItSavedMessage(plural);
  return couldntMessage("save that");
}

export function removeFailure(error: unknown, { noun }: WelcomeManualItemWords): string {
  const status = httpStatus(error);
  if (status === undefined) return offlineMessage(`delete that ${noun}`);
  if (status === 403) return FAILURE.viewOnly;
  return couldntMessage(`delete that ${noun}`);
}

/** A 409 here means the list changed under the person: the order they moved no longer matches the server. */
export function reorderFailure(error: unknown, { noun, plural }: WelcomeManualItemWords): string {
  const status = httpStatus(error);
  if (status === undefined) return offlineMessage(`save the new order of the ${plural}`);
  if (status === 403) return FAILURE.viewOnly;
  if (status === 404) return goneMessage(noun);
  if (status === 409) return WELCOME_MANUAL_REORDER_MESSAGES.stale;
  return couldntMessage("save the new order");
}

/**
 * Photos are added, so a lost answer or a server error may still have saved them. The server's own
 * wording for 413 and 415 is about files, not about what the person did, so fixed copy is used for
 * both; the section's photo limit (409) is written for the person and is shown.
 */
export function uploadFailure(error: unknown): string {
  const status = httpStatus(error);
  if (status === undefined) return notSureItSavedMessage("photos");
  if (status === 403) return FAILURE.viewOnly;
  if (status === 404) return goneMessage("section");
  if (status === 409) return getApiValidationDetail(error, photoLimitFallback(WELCOME_MANUAL_MAX_SECTION_IMAGES));
  if (status === 413) return FAILURE.tooBig;
  if (status === 415) return FAILURE.badType;
  if (status === 422) return FAILURE.invalid;
  if (status === 503) return FAILURE.noStorage;
  if (status >= SERVER_ERROR) return notSureItSavedMessage("photos");
  return couldntMessage("upload that");
}

/** Sharing changes what guests can open, so a lost answer is never guessed at. */
export function shareFailure(error: unknown, doing: string): string {
  const status = httpStatus(error);
  if (status === undefined) return offlineMessage(doing);
  if (status === 403) return FAILURE.viewOnly;
  if (status === 404) return goneMessage("manual");
  return couldntMessage(doing);
}

export function emailFailure(error: unknown): string {
  const status = httpStatus(error);
  if (status === undefined) return offlineMessage("send the guide. It may not have gone out");
  if (status === 403) return isDemoRefusal(error) ? FAILURE.demoEmail : FAILURE.viewOnly;
  if (status === 404) return goneMessage("manual or room");
  if (status === 422) return FAILURE.invalid;
  return couldntMessage("send the guide");
}
