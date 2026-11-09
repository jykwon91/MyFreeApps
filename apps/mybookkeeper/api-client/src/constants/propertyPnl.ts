import type { PropertyPnLPreset } from "../types/attribution/property-pnl-preset";

export const PROPERTY_PNL_PRESETS: readonly { key: PropertyPnLPreset; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "this_quarter", label: "This quarter" },
  { key: "ytd", label: "YTD" },
];

/** The expense categories each property's card lists before "+N more categories". */
export const PROPERTY_PNL_CATEGORIES_SHOWN = 4;
