import type { PropertyPnLPreset } from "@mybookkeeper/api-client/types/attribution/property-pnl-preset";
import type { PropertyPnLRange } from "@mybookkeeper/api-client/types/attribution/property-pnl-range";

/** The dates being shown, and the preset they came from (null for a hand-picked range). Remembered, because on the first day of a period several presets give the same dates. */
export interface PropertyPnlSelection {
  range: PropertyPnLRange;
  preset: PropertyPnLPreset | null;
}
