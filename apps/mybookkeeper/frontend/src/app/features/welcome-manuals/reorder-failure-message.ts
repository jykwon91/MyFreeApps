import { WELCOME_MANUAL_STALE_ORDER_MESSAGE } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";

const GENERIC_REORDER_FAILURE = "I couldn't save the new order. Reverting.";

/**
 * What to tell the host when saving a new order failed. A 409 means the list
 * changed somewhere else (the mutation's tag invalidation refetches it), so it
 * gets fixed copy; the server's own detail is for developers and never shown.
 */
export function reorderFailureMessage(error: unknown): string {
  return httpStatus(error) === 409 ? WELCOME_MANUAL_STALE_ORDER_MESSAGE : GENERIC_REORDER_FAILURE;
}
