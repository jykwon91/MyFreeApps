import { WORK_AUTH_STATUS_LABELS } from "../constants/workAuthStatusLabels";
import type { WorkAuthStatus } from "../types/profile/work-auth-status";

/** True for a work authorization status this client knows; a stored row may carry one added later on the backend. */
export function isWorkAuthStatus(value: string): value is WorkAuthStatus {
  return Object.prototype.hasOwnProperty.call(WORK_AUTH_STATUS_LABELS, value);
}
