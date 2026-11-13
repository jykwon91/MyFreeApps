import { getApiValidationDetail } from "@mybookkeeper/api-client/utils/apiValidationDetail";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { isDemoRefusal } from "@mybookkeeper/api-client/utils/isDemoRefusal";
import { INQUIRY_CREATE_MESSAGES as MESSAGES } from "../../constants/inquiryCreate";

const FORBIDDEN = 403;
const CLIENT_ERROR = 400;
const SERVER_ERROR = 500;

/**
 * What to say on the form when adding an inquiry fails. A 400, 409 or 422 is the server explaining
 * what it refused (an ID it needs, dates the wrong way round), so its own reason is shown. A lost answer or a
 * broken server may still have saved the inquiry, and a direct one has no duplicate check, so those say so.
 */
export function inquiryCreateFailure(error: unknown): string {
  const status = httpStatus(error);
  if (status === FORBIDDEN) return isDemoRefusal(error) ? MESSAGES.demo : MESSAGES.viewOnly;
  if (status === undefined || status >= SERVER_ERROR) return MESSAGES.unsure;
  if (status >= CLIENT_ERROR) return getApiValidationDetail(error, MESSAGES.rejectedFallback);
  return MESSAGES.other;
}
