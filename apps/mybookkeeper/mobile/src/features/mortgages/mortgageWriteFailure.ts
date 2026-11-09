import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { isDemoRefusal } from "@mybookkeeper/api-client/utils/isDemoRefusal";
import { MORTGAGE_FORM_MESSAGES as MESSAGES } from "../../constants/mortgageForm";

export type MortgageWrite = "create" | "update";

/** The server's own wording can be a developer string, so only the status is read. */
export function mortgageWriteFailure(error: unknown, write: MortgageWrite): string {
  const status = httpStatus(error);
  if (status === undefined) return write === "create" ? MESSAGES.createUnsure : MESSAGES.lostConnection;
  if (status === 403) return isDemoRefusal(error) ? MESSAGES.demo : MESSAGES.viewOnly;
  if (status === 404) return write === "create" ? MESSAGES.goneProperty : MESSAGES.gone;
  if (status === 422) return MESSAGES.invalid;
  // A 5xx can come from the proxy after the server has already saved.
  if (status >= 500 && write === "create") return MESSAGES.createUnsure;
  return MESSAGES.retry;
}
