import { ANALYTICS_RANGE_PRESETS } from "@mybookkeeper/api-client/constants/analyticsRanges";
import { comparisonRange } from "@mybookkeeper/api-client/utils/comparePeriods";
import { calendarYearRange, propertyPnlRange } from "@mybookkeeper/api-client/utils/propertyPnlRange";
import type { RangePreset } from "@mybookkeeper/api-client/types/analytics/range-preset";
import type { CompareMode } from "@mybookkeeper/api-client/types/analytics/compare-mode";
import type { PropertyPnLRange } from "@mybookkeeper/api-client/types/attribution/property-pnl-range";
import { dashboardYears } from "@mybookkeeper/api-client/utils/dashboardYears";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import type { AnalysisChoice } from "../../types/AnalysisChoice";
import type { AnalysisPeriodKey } from "../../types/AnalysisPeriodKey";
import type { AnalysisSelection } from "../../types/AnalysisSelection";
import { customRangeLabel } from "../transactions/transactionDisplay";

/** Every way to pick dates, newest first among the years. Years come from the data, so none is offered that has nothing. */
export function analysisChoices(today: Date, dataYears: readonly number[] | undefined): AnalysisChoice[] {
  return [
    ...ANALYTICS_RANGE_PRESETS.map((preset) => ({ key: preset.key, label: preset.label, range: propertyPnlRange(preset.key, today) })),
    ...dashboardYears(dataYears, today.getFullYear()).map((year) => ({ key: `year_${year}` as const, label: String(year), range: calendarYearRange(year) })),
    { key: "all_time", label: "All time", range: null },
  ];
}

export function choiceSelection(choice: AnalysisChoice): AnalysisSelection {
  return { key: choice.key, range: choice.range };
}

/** The selection a screen starts on. */
export function selectionFor(key: AnalysisPeriodKey, today: Date): AnalysisSelection {
  const choice = analysisChoices(today, undefined).find((candidate) => candidate.key === key);
  return choice ? choiceSelection(choice) : { key: null, range: null };
}

const PRESET_KEYS: ReadonlySet<string> = new Set(ANALYTICS_RANGE_PRESETS.map((preset) => preset.key));

/** The selection as of today. A preset such as "last 12 months" moves on with the date; a year, all time or hand-picked dates do not. */
export function currentSelection(selection: AnalysisSelection, today: Date): AnalysisSelection {
  if (selection.key === null || !PRESET_KEYS.has(selection.key)) return selection;
  return { key: selection.key, range: propertyPnlRange(selection.key as RangePreset, today) };
}

export function selectionName(selection: AnalysisSelection, choices: readonly AnalysisChoice[]): string {
  if (selection.key === null) return MESSAGES.customRange;
  return choices.find((choice) => choice.key === selection.key)?.label ?? selection.key;
}

export function selectionDates(selection: AnalysisSelection): string {
  return selection.range ? customRangeLabel(selection.range.since, selection.range.until) : "Every date";
}

/** The query's dates. Undefined for all time, which the server reads as no limit. */
export function summaryDates(range: PropertyPnLRange | null): { startDate?: string; endDate?: string } {
  return range ? { startDate: range.since, endDate: range.until } : {};
}

/** What to set the selection against, or null when comparing is off or there are no dates to step back from. */
export function selectionComparison(selection: AnalysisSelection, mode: CompareMode): PropertyPnLRange | null {
  if (mode === "none" || !selection.range) return null;
  return comparisonRange(selection.range, mode);
}
