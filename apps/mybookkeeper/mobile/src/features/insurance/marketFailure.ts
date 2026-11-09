import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { MARKET_MESSAGES } from "../../constants/insuranceMarket";

/** The server's own explanation of a rejected figure is a developer string, so it's never shown. */
export function marketSaveFailure(error: unknown): string {
  switch (httpStatus(error)) {
    case undefined:
      return MARKET_MESSAGES.saveOffline;
    case 403:
      return MARKET_MESSAGES.notAllowed;
    case 422:
      return MARKET_MESSAGES.saveRejected;
    default:
      return MARKET_MESSAGES.saveFailed;
  }
}

export function marketRemoveFailure(error: unknown): string {
  switch (httpStatus(error)) {
    case undefined:
      return MARKET_MESSAGES.removeOffline;
    case 403:
      return MARKET_MESSAGES.notAllowed;
    case 404:
      return MARKET_MESSAGES.removeGone;
    default:
      return MARKET_MESSAGES.removeFailed;
  }
}
