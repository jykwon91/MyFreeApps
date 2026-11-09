import { format } from "date-fns";

/** A day in the person's own time zone. Going through UTC could move it to the neighbouring day. */
export function isoDay(date: Date): string {
  return format(date, "yyyy-MM-dd");
}
