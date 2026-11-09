import type { PropertyPnLRange } from "@mybookkeeper/api-client/types/attribution/property-pnl-range";
import type { AnalysisPeriodKey } from "./AnalysisPeriodKey";

/** One line in the period sheet. `range` is null for all time. */
export interface AnalysisChoice {
  key: AnalysisPeriodKey;
  label: string;
  range: PropertyPnLRange | null;
}
