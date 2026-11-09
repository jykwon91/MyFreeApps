import { LEASE_DOCUMENT_MESSAGES as MESSAGES } from "../../constants/leaseDocuments";
import type { WriteFailureCopy } from "../../types/WriteFailureCopy";

/** Making documents isn't safe to repeat blindly, so a lost answer or a broken server has to say so. */
export const ADD_DOCUMENT_COPY: WriteFailureCopy = {
  noResponse: MESSAGES.unsure,
  viewOnly: MESSAGES.viewOnly,
  gone: MESSAGES.gone,
  conflict: MESSAGES.refused,
  invalid: MESSAGES.refused,
  serverError: MESSAGES.unsure,
  other: MESSAGES.refused,
};
