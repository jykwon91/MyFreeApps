import { dateFromIso } from "../../lib/localDate";

/** The first of a month, as the calendar keeps it: `YYYY-MM-01`. */
export function monthFromParts(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
}

export function monthLabelFor(year: number, month: number): string {
  return dateFromIso(monthFromParts(year, month)).toLocaleDateString(undefined, { month: "long" });
}

/** How far the jump goes either way from this year, so the arrows can't wander off into nothing. */
export function yearBounds(thisMonth: string, yearsBack: number, yearsAhead: number): { first: number; last: number } {
  const thisYear = Number(thisMonth.slice(0, 4));
  return { first: thisYear - yearsBack, last: thisYear + yearsAhead };
}
