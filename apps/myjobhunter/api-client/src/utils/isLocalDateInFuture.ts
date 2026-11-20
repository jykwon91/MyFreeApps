import { localToday } from "@platform/core/utils/localToday";

/** Whether a local calendar day ("YYYY-MM-DD") is after today where the person is. */
export function isLocalDateInFuture(isoDate: string): boolean {
  return isoDate > localToday();
}
