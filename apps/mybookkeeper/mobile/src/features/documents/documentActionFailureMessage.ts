import { errorDetail } from "@mybookkeeper/api-client/utils/errorDetail";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { DOCUMENT_ACTION_MESSAGES } from "../../constants/documents";

/** Delete and read-again answer 409 while the document is being read (the server says so) and 404 once it's gone. */
export function documentActionFailureMessage(error: unknown, fallback: string): string {
  switch (httpStatus(error)) {
    case 409: {
      const detail = errorDetail(error);
      return typeof detail === "string" && detail.length > 0 ? detail : DOCUMENT_ACTION_MESSAGES.stillBeingRead;
    }
    case 404:
      return DOCUMENT_ACTION_MESSAGES.alreadyGone;
    default:
      return fallback;
  }
}
