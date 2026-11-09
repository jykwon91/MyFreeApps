import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { LEASE_IMPORT_MESSAGES as MESSAGES } from "../../constants/leaseImport";

/** Importing isn't safe to repeat blindly, so a lost answer or a broken server has to say so. Fixed words only. */
export function leaseImportFailure(error: unknown): string {
  const status = httpStatus(error);
  if (status === 403) return MESSAGES.viewOnly;
  if (status === 404) return MESSAGES.goneTenant;
  if (status === 413) return MESSAGES.tooBig;
  if (status === 415) return MESSAGES.badFile;
  if (status === 503) return MESSAGES.storageDown;
  if (status === undefined || status >= 500) return MESSAGES.unsure;
  return MESSAGES.refused;
}
