import type { PropertyPnLRange } from "@mybookkeeper/api-client/types/attribution/property-pnl-range";
import type { AnalysisPeriodKey } from "./AnalysisPeriodKey";

/** The dates being looked at and the choice they came from (null for hand-picked dates). Remembered because several choices can give the same dates. `range` is null for all time. */
export interface AnalysisSelection {
  key: AnalysisPeriodKey | null;
  range: PropertyPnLRange | null;
}
