import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { DOCUMENT_BULK_MESSAGES as MESSAGES } from "../../constants/documentBulk";
import { writeOutcome } from "@platform/core/utils/writeOutcome";

/** The server's own wording can be a developer string, so it's never shown. After a lost answer (see writeOutcome) deleting again is harmless. */
export function bulkDeleteFailureMessage(error: unknown): string {
  if (writeOutcome(error) === "unknown") return MESSAGES.unsure;
  switch (httpStatus(error)) {
    case 403:
      return MESSAGES.viewOnlyFailure;
    default:
      return MESSAGES.otherFailure;
  }
}
