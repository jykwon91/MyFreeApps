import { addMonths, format, isValid, parse } from "date-fns";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_FORMAT = "yyyy-MM";

/** The month ``day`` falls in, as "YYYY-MM" (local time). */
export function monthOf(day: Date): string {
  return format(day, MONTH_FORMAT);
}

/** True for a real "YYYY-MM". */
export function isMonthText(value: string | null): value is string {
  return value !== null && MONTH_PATTERN.test(value);
}

function toDate(month: string): Date {
  return parse(month, MONTH_FORMAT, new Date());
}

/** "2026-11" moved ``count`` months (negative goes back). */
export function shiftMonth(month: string, count: number): string {
  return format(addMonths(toDate(month), count), MONTH_FORMAT);
}

/** "2026-11" as "November 2026". */
export function formatMonthLong(month: string): string {
  const date = toDate(month);
  return isValid(date) ? format(date, "MMMM yyyy") : month;
}

/** "2026-11" as "Nov 26", for chart axes. */
export function formatMonthShort(month: string): string {
  return format(toDate(month), "MMM yy");
}
