import { isNoResponse } from "@platform/core/utils/isNoResponse";
import { requestErrorStatus } from "@myrecipes/api-client/utils/requestErrorStatus";
import { DIFF_PERMANENT_ERROR_STATUSES } from "../constants/versions";

/** Whether asking again could load the comparison: not for a link that is wrong or a version that's gone. */
export function isDiffRetryable(error: unknown): boolean {
  if (isNoResponse(error)) return true;
  const status = requestErrorStatus(error);
  return status === undefined || !DIFF_PERMANENT_ERROR_STATUSES.includes(status);
}
