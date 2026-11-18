import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { isDemoRefusal } from "@mybookkeeper/api-client/utils/isDemoRefusal";
import { MORTGAGE_FORM_MESSAGES } from "../../constants/mortgageForm";
import { MORTGAGE_MESSAGES } from "../../constants/mortgages";
import { writeOutcome } from "@platform/core/utils/writeOutcome";

/** "gone" counts as done: the loan is already not there. */
export type RemoveOutcome = "gone" | { message: string };

export function mortgageRemoveFailure(error: unknown): RemoveOutcome {
  // A lost answer or a proxy error can come after the removal (see writeOutcome); removing it again answers "gone".
  if (writeOutcome(error) === "unknown") return { message: MORTGAGE_MESSAGES.removeUnsure };
  const status = httpStatus(error);
  if (status === 404) return "gone";
  if (status === 403) return { message: isDemoRefusal(error) ? MORTGAGE_FORM_MESSAGES.demo : MORTGAGE_MESSAGES.removeViewOnly };
  return { message: MORTGAGE_MESSAGES.removeFailed };
}
