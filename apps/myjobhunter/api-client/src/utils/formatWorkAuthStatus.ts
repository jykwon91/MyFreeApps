import { WORK_AUTH_STATUS_LABELS } from "../constants/workAuthStatusLabels";
import { humanizeKey } from "./humanizeKey";
import { isWorkAuthStatus } from "./isWorkAuthStatus";

/** A work authorization status in words; one this client doesn't know still reads sensibly. */
export function formatWorkAuthStatus(status: string): string {
  return isWorkAuthStatus(status) ? WORK_AUTH_STATUS_LABELS[status] : humanizeKey(status);
}
