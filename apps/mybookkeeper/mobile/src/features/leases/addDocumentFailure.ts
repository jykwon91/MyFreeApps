import { WRITE_RATE_LIMITED_MESSAGE, WRITE_TOO_LARGE_MESSAGE } from "@mybookkeeper/api-client/constants/writeFailureMessages";
import { DEMO_WORKSPACE_REFUSED } from "@mybookkeeper/api-client/constants/demoRefusal";
import { LEASE_DOCUMENT_MESSAGES as MESSAGES } from "../../constants/leaseDocuments";
import type { WriteFailureCopy } from "../../types/WriteFailureCopy";

/** Making documents isn't safe to repeat blindly, so a lost answer or a broken server has to say so. */
export const ADD_DOCUMENT_COPY: WriteFailureCopy = {
  noResponse: MESSAGES.unsure,
  viewOnly: MESSAGES.viewOnly,
  demo: DEMO_WORKSPACE_REFUSED,
  gone: MESSAGES.gone,
  conflict: MESSAGES.refused,
  invalid: MESSAGES.refused,
  serverError: MESSAGES.unsure,
  other: MESSAGES.refused,
  rateLimited: WRITE_RATE_LIMITED_MESSAGE,
  tooLarge: WRITE_TOO_LARGE_MESSAGE,
};
