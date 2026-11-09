import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { MORTGAGE_STATEMENT_MESSAGES as MESSAGES } from "../../constants/mortgageForm";

/** What to say when reading a statement fails. Each status needs a different next move. */
export function statementReadFailure(error: unknown): string {
  switch (httpStatus(error)) {
    case undefined:
      return MESSAGES.lostConnection;
    case 403:
      return MESSAGES.viewOnly;
    case 404:
      return MESSAGES.gone;
    case 413:
      return MESSAGES.tooBig;
    case 415:
      return MESSAGES.wrongType;
    case 422:
      return MESSAGES.unreadable;
    case 429:
      return MESSAGES.tooMany;
    case 503:
      return MESSAGES.storageDown;
    default:
      return MESSAGES.somethingWrong;
  }
}
