import type { PropertyPnLPreset } from "../attribution/property-pnl-preset";

/** A named stretch of time. The property P&L offers the first three; analytics offers all of them. */
export type RangePreset = PropertyPnLPreset | "last_month" | "last_quarter" | "last_12_months" | "last_year";
