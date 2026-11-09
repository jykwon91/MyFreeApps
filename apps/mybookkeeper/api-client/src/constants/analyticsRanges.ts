import type { CompareMode } from "../types/analytics/compare-mode";
import type { RangePreset } from "../types/analytics/range-preset";

export const ANALYTICS_RANGE_PRESETS: readonly { key: RangePreset; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "this_quarter", label: "This quarter" },
  { key: "last_quarter", label: "Last quarter" },
  { key: "ytd", label: "Year to date" },
  { key: "last_12_months", label: "Last 12 months" },
  { key: "last_year", label: "Last year" },
];

export const COMPARE_MODES: readonly { key: CompareMode; label: string }[] = [
  { key: "none", label: "Don't compare" },
  { key: "previous_period", label: "The period before" },
  { key: "previous_year", label: "The same dates last year" },
];
