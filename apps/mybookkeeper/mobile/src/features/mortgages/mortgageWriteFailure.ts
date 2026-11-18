import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { isDemoRefusal } from "@mybookkeeper/api-client/utils/isDemoRefusal";
import { MORTGAGE_FORM_MESSAGES as MESSAGES } from "../../constants/mortgageForm";
import { writeOutcome } from "@platform/core/utils/writeOutcome";

export type MortgageWrite = "create" | "update";

/** The server's own wording can be a developer string, so only the status is read. */
export function mortgageWriteFailure(error: unknown, write: MortgageWrite): string {
  // A lost answer or a proxy error can come after the save (see writeOutcome): a new loan could be added twice, a change is safe to send again.
  if (writeOutcome(error) === "unknown") return write === "create" ? MESSAGES.createUnsure : MESSAGES.changeUnsure;
  const status = httpStatus(error);
  if (status === 403) return isDemoRefusal(error) ? MESSAGES.demo : MESSAGES.viewOnly;
  if (status === 404) return write === "create" ? MESSAGES.goneProperty : MESSAGES.gone;
  if (status === 422) return MESSAGES.invalid;
  // A 5xx can come from the proxy after the server has already saved.
  if (status !== undefined && status >= 500 && write === "create") return MESSAGES.createUnsure;
  return MESSAGES.retry;
}
