import { PAYMENT_REVIEW_MESSAGES as MESSAGES, PAYMENT_REVIEW_SERVER_DETAILS as DETAILS } from "../../constants/paymentReview";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";

function serverDetail(error: unknown): unknown {
  return (error as { data?: { detail?: unknown } } | null)?.data?.detail;
}

/** Somebody already dealt with it, so the row leaves the list and nothing went wrong. */
export function wasAlreadyHandled(error: unknown): boolean {
  return serverDetail(error) === DETAILS.alreadyResolved;
}

/** The server reuses 404 and 422 for different things, so only its words can tell them apart. */
export function reviewFailureMessage(error: unknown): string {
  if (wasAlreadyHandled(error)) return MESSAGES.alreadyHandled;
  const detail = serverDetail(error);
  if (detail === DETAILS.noTarget) return MESSAGES.noTarget;
  if (detail === DETAILS.applicantGone) return MESSAGES.tenantGone;
  if (detail === DETAILS.propertyGone) return MESSAGES.propertyGone;
  switch (httpStatus(error)) {
    case undefined:
      return MESSAGES.unreachable;
    case 403:
      return MESSAGES.viewerRefused;
    case 404:
      return MESSAGES.gone;
    default:
      return MESSAGES.couldntSave;
  }
}
