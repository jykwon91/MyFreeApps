import { MAY_STILL_ARRIVE_ERROR_CODES } from "../constants/rentReminderErrorCodes";

/** A failed send whose text or email may still have reached the tenant. */
export function reminderMayStillArrive(code: string | null): boolean {
  return code !== null && MAY_STILL_ARRIVE_ERROR_CODES.includes(code);
}
