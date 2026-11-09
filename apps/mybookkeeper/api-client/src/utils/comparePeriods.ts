import { addDays, differenceInCalendarDays, differenceInCalendarMonths, endOfMonth, format, isSameDay, parseISO, startOfMonth, subMonths, subYears } from "date-fns";
import type { ChangeFigures } from "../types/analytics/change-figures";
import type { CompareMode } from "../types/analytics/compare-mode";
import type { PropertyPnLRange } from "../types/attribution/property-pnl-range";

/** A day in the person's own time zone. Going through UTC could move it to the neighbouring day. */
function isoDay(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function isWholeMonths(start: Date, end: Date): boolean {
  return isSameDay(start, startOfMonth(start)) && isSameDay(end, endOfMonth(end));
}

/**
 * The dates to set a range against. "The period before" is as long as the range and ends the day
 * it begins, except that a range starting on the 1st moves by whole months: March is set against
 * February, and the first nine days of November against the first nine days of October.
 */
export function comparisonRange(range: PropertyPnLRange, mode: Exclude<CompareMode, "none">): PropertyPnLRange {
  const start = parseISO(range.since);
  const end = parseISO(range.until);
  if (mode === "previous_year") return { since: isoDay(subYears(start, 1)), until: isoDay(subYears(end, 1)) };
  if (isSameDay(start, startOfMonth(start))) {
    const months = differenceInCalendarMonths(end, start) + 1;
    const before = subMonths(end, months);
    return { since: isoDay(subMonths(start, months)), until: isoDay(isWholeMonths(start, end) ? endOfMonth(before) : before) };
  }
  const days = differenceInCalendarDays(end, start) + 1;
  return { since: isoDay(addDays(start, -days)), until: isoDay(addDays(start, -1)) };
}

/** How a number moved. With nothing before it there is no percentage to give, never a division by zero. */
export function changeFigures(current: number, previous: number): ChangeFigures {
  const delta = current - previous;
  return { delta, percent: previous === 0 ? null : (delta / Math.abs(previous)) * 100 };
}
