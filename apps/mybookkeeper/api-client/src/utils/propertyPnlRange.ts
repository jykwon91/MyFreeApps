import { endOfMonth, endOfQuarter, format, startOfMonth, startOfQuarter, startOfYear, subMonths, subQuarters, subYears } from "date-fns";
import type { RangePreset } from "../types/analytics/range-preset";
import type { PropertyPnLRange } from "../types/attribution/property-pnl-range";

/** A day in the person's own time zone. Going through UTC could move it to the neighbouring day. */
function isoDay(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** The preset's dates. The "this" ones run from the start of the period up to and including today; the "last" ones are whole periods. */
export function propertyPnlRange(preset: RangePreset, today: Date): PropertyPnLRange {
  const until = isoDay(today);
  switch (preset) {
    case "this_month":
      return { since: isoDay(startOfMonth(today)), until };
    case "this_quarter":
      return { since: isoDay(startOfQuarter(today)), until };
    case "ytd":
      return { since: isoDay(startOfYear(today)), until };
    case "last_month": {
      const month = subMonths(today, 1);
      return { since: isoDay(startOfMonth(month)), until: isoDay(endOfMonth(month)) };
    }
    case "last_quarter": {
      const quarter = subQuarters(today, 1);
      return { since: isoDay(startOfQuarter(quarter)), until: isoDay(endOfQuarter(quarter)) };
    }
    case "last_12_months":
      return { since: isoDay(startOfMonth(subMonths(today, 11))), until };
    case "last_year": {
      const year = subYears(today, 1);
      return { since: isoDay(startOfYear(year)), until: `${year.getFullYear()}-12-31` };
    }
  }
}

/** January 1 to December 31 of a year, whether or not it has finished. */
export function calendarYearRange(year: number): PropertyPnLRange {
  return { since: `${year}-01-01`, until: `${year}-12-31` };
}

/**
 * The first preset whose range is exactly this one. On the first day of a period several presets
 * coincide, so a screen that knows which one was picked should remember it rather than infer it.
 */
export function activePropertyPnlPreset<Preset extends RangePreset>(
  range: PropertyPnLRange,
  presets: readonly Preset[],
  today: Date,
): Preset | null {
  return (
    presets.find((preset) => {
      const candidate = propertyPnlRange(preset, today);
      return candidate.since === range.since && candidate.until === range.until;
    }) ?? null
  );
}

export function isValidPropertyPnlRange({ since, until }: PropertyPnLRange): boolean {
  return since !== "" && until !== "" && since <= until;
}
