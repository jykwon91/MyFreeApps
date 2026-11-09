import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { DOCUMENT_BULK_MESSAGES as MESSAGES } from "../../constants/documentBulk";

/** The server's own wording can be a developer string, so it's never shown. */
export function bulkDeleteFailureMessage(error: unknown): string {
  switch (httpStatus(error)) {
    case undefined:
      return MESSAGES.offlineFailure;
    case 403:
      return MESSAGES.viewOnlyFailure;
    default:
      return MESSAGES.otherFailure;
  }
}
