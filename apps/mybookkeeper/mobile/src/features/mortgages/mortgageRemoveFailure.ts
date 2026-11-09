import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { isDemoRefusal } from "@mybookkeeper/api-client/utils/isDemoRefusal";
import { MORTGAGE_FORM_MESSAGES } from "../../constants/mortgageForm";
import { MORTGAGE_MESSAGES } from "../../constants/mortgages";

/** "gone" counts as done: the loan is already not there. */
export type RemoveOutcome = "gone" | { message: string };

export function mortgageRemoveFailure(error: unknown): RemoveOutcome {
  const status = httpStatus(error);
  if (status === undefined) return { message: MORTGAGE_MESSAGES.removeLostConnection };
  if (status === 404) return "gone";
  if (status === 403) return { message: isDemoRefusal(error) ? MORTGAGE_FORM_MESSAGES.demo : MORTGAGE_MESSAGES.removeViewOnly };
  return { message: MORTGAGE_MESSAGES.removeFailed };
}
