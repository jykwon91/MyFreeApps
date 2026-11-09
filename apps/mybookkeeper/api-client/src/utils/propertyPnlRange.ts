import { format, startOfMonth, startOfQuarter, startOfYear } from "date-fns";
import type { PropertyPnLPreset } from "../types/attribution/property-pnl-preset";
import type { PropertyPnLRange } from "../types/attribution/property-pnl-range";

/** A day in the person's own time zone. Going through UTC could move it to the neighbouring day. */
function isoDay(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** From the start of the preset's period up to and including today. */
export function propertyPnlRange(preset: PropertyPnLPreset, today: Date): PropertyPnLRange {
  const until = isoDay(today);
  switch (preset) {
    case "this_month":
      return { since: isoDay(startOfMonth(today)), until };
    case "this_quarter":
      return { since: isoDay(startOfQuarter(today)), until };
    case "ytd":
      return { since: isoDay(startOfYear(today)), until };
  }
}

/**
 * The first preset whose range is exactly this one. On the first day of a period several presets
 * coincide, so a screen that knows which one was picked should remember it rather than infer it.
 */
export function activePropertyPnlPreset(
  range: PropertyPnLRange,
  presets: readonly PropertyPnLPreset[],
  today: Date,
): PropertyPnLPreset | null {
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
