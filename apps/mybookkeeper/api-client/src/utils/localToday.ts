import { format } from "date-fns";

/** The host's date. UTC would be tomorrow on a US evening. */
export function localToday(): string {
  return format(new Date(), "yyyy-MM-dd");
}
