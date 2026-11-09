/** A date picker works in the phone's time zone, so these never go through UTC, which could move the day. */
export function dateFromIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isoFromDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function monthOf(date: Date): string {
  return isoFromDate(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function shiftMonth(month: string, by: number): string {
  const start = dateFromIso(month);
  return isoFromDate(new Date(start.getFullYear(), start.getMonth() + by, 1));
}

const MS_PER_DAY = 86_400_000;

/** Whole days from one date to another, unaffected by a clock change between them. */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((dateFromIso(toIso).getTime() - dateFromIso(fromIso).getTime()) / MS_PER_DAY);
}

/** A date some days on (or before), counted on the calendar so a clock change can't shift it. */
export function addDays(iso: string, days: number): string {
  const start = dateFromIso(iso);
  return isoFromDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + days));
}

export function fullDateLabel(iso: string): string {
  return dateFromIso(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** A "YYYY-MM" month, as the API reports it, from its first day to its last. */
export function monthBounds(month: string): { start_date: string; end_date: string } {
  const first = dateFromIso(`${month}-01`);
  return { start_date: isoFromDate(first), end_date: isoFromDate(new Date(first.getFullYear(), first.getMonth() + 1, 0)) };
}

/** A "YYYY-MM" month moved by whole months. */
export function addMonths(month: string, by: number): string {
  return shiftMonth(`${month}-01`, by).slice(0, 7);
}

/** "Mar" under a chart, "March 2026" in a sentence. */
export function monthName(month: string, format: "short" | "long"): string {
  return dateFromIso(`${month}-01`).toLocaleDateString("en-US", format === "short" ? { month: "short" } : { month: "long", year: "numeric" });
}
