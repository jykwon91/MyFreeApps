import type { RangePreset } from "@mybookkeeper/api-client/types/analytics/range-preset";

/** A way to pick dates: a named stretch, one calendar year, or no dates at all. */
export type AnalysisPeriodKey = RangePreset | "all_time" | `year_${number}`;
