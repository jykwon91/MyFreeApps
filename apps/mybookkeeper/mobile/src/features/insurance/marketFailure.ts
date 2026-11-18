import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { MARKET_MESSAGES } from "../../constants/insuranceMarket";
import { writeOutcome } from "@platform/core/utils/writeOutcome";

/**
 * The server's own explanation of a rejected figure is a developer string, so it's never shown.
 * A lost answer or a proxy error can come after the change landed (see writeOutcome); both writes are safe to send again.
 */
export function marketSaveFailure(error: unknown): string {
  if (writeOutcome(error) === "unknown") return MARKET_MESSAGES.saveUnsure;
  switch (httpStatus(error)) {
    case 403:
      return MARKET_MESSAGES.notAllowed;
    case 422:
      return MARKET_MESSAGES.saveRejected;
    default:
      return MARKET_MESSAGES.saveFailed;
  }
}

export function marketRemoveFailure(error: unknown): string {
  if (writeOutcome(error) === "unknown") return MARKET_MESSAGES.removeUnsure;
  switch (httpStatus(error)) {
    case 403:
      return MARKET_MESSAGES.notAllowed;
    case 404:
      return MARKET_MESSAGES.removeGone;
    default:
      return MARKET_MESSAGES.removeFailed;
  }
}
