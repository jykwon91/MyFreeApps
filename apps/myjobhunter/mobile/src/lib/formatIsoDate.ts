import { isoDateToDate } from "./isoDateToDate";

/** A calendar date such as "Mar 4, 2021", in the reader's locale. */
export function formatIsoDate(isoDate: string): string {
  return isoDateToDate(isoDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
