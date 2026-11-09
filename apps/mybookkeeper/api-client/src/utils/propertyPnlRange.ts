import type { PropertyPnLPreset } from "../types/attribution/property-pnl-preset";
import type { PropertyPnLRange } from "../types/attribution/property-pnl-range";

/** A day in the person's own time zone. Going through UTC could move it to the neighbouring day. */
function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** From the start of the preset's period up to and including today. */
export function propertyPnlRange(preset: PropertyPnLPreset, today: Date): PropertyPnLRange {
  const until = isoDay(today);
  switch (preset) {
    case "this_month":
      return { since: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)), until };
    case "this_quarter":
      return { since: isoDay(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1)), until };
    case "ytd":
      return { since: isoDay(new Date(today.getFullYear(), 0, 1)), until };
  }
}

/** The preset whose period the range starts at, if any. A range picked by hand starts wherever it likes. */
export function activePropertyPnlPreset(
  range: PropertyPnLRange,
  presets: readonly PropertyPnLPreset[],
  today: Date,
): PropertyPnLPreset | null {
  return presets.find((preset) => propertyPnlRange(preset, today).since === range.since) ?? null;
}

export function isValidPropertyPnlRange({ since, until }: PropertyPnLRange): boolean {
  return since !== "" && until !== "" && since <= until;
}
