import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { REFERENCE_ONLY_MESSAGES as MESSAGES } from "../../constants/documents";

export function referenceOnlyFailureMessage(error: unknown): string {
  return httpStatus(error) === undefined ? MESSAGES.offlineFailure : MESSAGES.otherFailure;
}
