import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { REVIEW_MESSAGES } from "../../constants/calendarReview";

/** The server's own wording can be a developer string, so it's never shown. */
function failure(error: unknown, otherwise: string, extra: Partial<Record<number, string>> = {}): string {
  const status = httpStatus(error);
  if (status === 403) return REVIEW_MESSAGES.notAllowed;
  if (status === 404 || status === 409) return REVIEW_MESSAGES.alreadyHandled;
  return (status !== undefined && extra[status]) || otherwise;
}

export function addFailure(error: unknown): string {
  return failure(error, REVIEW_MESSAGES.addFailed, { 422: REVIEW_MESSAGES.listingRefused });
}

export function ignoreFailure(error: unknown): string {
  return failure(error, REVIEW_MESSAGES.ignoreFailed);
}

export function dismissFailure(error: unknown): string {
  return failure(error, REVIEW_MESSAGES.dismissFailed);
}
