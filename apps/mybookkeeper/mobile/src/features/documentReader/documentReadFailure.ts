import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import type { DocumentReaderMessages } from "../../types/DocumentReaderMessages";

/** What to say when reading a document fails. Each status needs a different next move. */
export function documentReadFailure(error: unknown, messages: DocumentReaderMessages): string {
  switch (httpStatus(error)) {
    case undefined:
      return messages.lostConnection;
    case 403:
      return messages.viewOnly;
    case 404:
      return messages.gone;
    case 413:
      return messages.tooBig;
    case 415:
      return messages.wrongType;
    case 422:
      return messages.unreadable;
    case 429:
      return messages.tooMany;
    case 503:
      return messages.storageDown;
    default:
      return messages.somethingWrong;
  }
}
