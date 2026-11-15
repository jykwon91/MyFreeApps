import { format } from "date-fns";

/** Today's date (YYYY-MM-DD) in the device's own time zone. Going through UTC would give tomorrow on a US evening. */
export function localToday(): string {
  return format(new Date(), "yyyy-MM-dd");
}
