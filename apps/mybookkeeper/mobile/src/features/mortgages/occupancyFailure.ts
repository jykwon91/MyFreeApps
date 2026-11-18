import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { MORTGAGE_RATE_MESSAGES as MESSAGES } from "../../constants/mortgageRates";
import { writeOutcome } from "@platform/core/utils/writeOutcome";

/** Setting the occupancy again is harmless, so after a lost answer (see writeOutcome) it says a retry is safe. */
export function occupancyFailure(error: unknown): string {
  if (writeOutcome(error) === "unknown") return MESSAGES.occupancyUnsure;
  switch (httpStatus(error)) {
    case 403:
      return MESSAGES.occupancyViewOnly;
    default:
      return MESSAGES.occupancyFailed;
  }
}
