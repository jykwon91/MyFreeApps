import { format, parseISO } from "date-fns";

/** When the advice was written, with the time of day: "Mar 10, 2026 at 2:05 PM". */
export function formatAdvisorGeneratedAt(isoTimestamp: string): string {
  return format(parseISO(isoTimestamp), "MMM d, yyyy 'at' h:mm a");
}
