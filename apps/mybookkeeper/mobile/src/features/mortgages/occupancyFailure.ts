import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { MORTGAGE_RATE_MESSAGES as MESSAGES } from "../../constants/mortgageRates";

export function occupancyFailure(error: unknown): string {
  switch (httpStatus(error)) {
    case undefined:
      return MESSAGES.occupancyLostConnection;
    case 403:
      return MESSAGES.occupancyViewOnly;
    default:
      return MESSAGES.occupancyFailed;
  }
}
