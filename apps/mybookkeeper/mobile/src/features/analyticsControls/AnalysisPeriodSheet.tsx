import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import type { AnalysisChoice } from "../../types/AnalysisChoice";
import type { AnalysisPeriodKey } from "../../types/AnalysisPeriodKey";
import type { AnalysisSelection } from "../../types/AnalysisSelection";
import PeriodSheet from "./PeriodSheet";

interface AnalysisPeriodSheetProps {
  choices: readonly AnalysisChoice[];
  selection: AnalysisSelection;
  today: Date;
  onApply: (selection: AnalysisSelection) => void;
  onClose: () => void;
}

/** The analytics screens' period sheet: every preset, the years with data, all time and hand-picked dates. */
export default function AnalysisPeriodSheet({ choices, selection, today, onApply, onClose }: AnalysisPeriodSheetProps) {
  return <PeriodSheet<AnalysisPeriodKey> choices={choices} messages={MESSAGES} onApply={onApply} onClose={onClose} selection={selection} today={today} />;
}
