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

export function fullDateLabel(iso: string): string {
  return dateFromIso(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
