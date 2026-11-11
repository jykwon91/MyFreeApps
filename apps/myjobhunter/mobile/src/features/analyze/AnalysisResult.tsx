import { useTheme } from "@platform/mobile";
import { Text } from "react-native";
import FlagList from "../../components/FlagList";
import { ANALYZE_MESSAGES as MESSAGES } from "../../constants/analyze";
import type { AnalysisResultProps } from "../../types/AnalysisResultProps";
import AnalysisActions from "./AnalysisActions";
import AnalysisDimensions from "./AnalysisDimensions";
import AnalysisHeader from "./AnalysisHeader";
import VerdictCard from "./VerdictCard";

/** Everything the website's result shows, in its order: role, verdict, dimensions, flags, then what to do. */
export default function AnalysisResult({ analysis, isApplying, onApply, onAnalyzeAnother, onViewApplications }: AnalysisResultProps) {
  const { colors, fontSize } = useTheme();
  return (
    <>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{MESSAGES.analyzedAgainst}</Text>
      <AnalysisHeader extracted={analysis.extracted} sourceUrl={analysis.source_url} />
      <VerdictCard summary={analysis.verdict_summary} verdict={analysis.verdict} />
      <AnalysisDimensions dimensions={analysis.dimensions} />
      <FlagList flags={analysis.red_flags} title={MESSAGES.redFlags} tone="danger" />
      <FlagList flags={analysis.green_flags} title={MESSAGES.greenFlags} tone="success" />
      <AnalysisActions
        appliedApplicationId={analysis.applied_application_id}
        isApplying={isApplying}
        onAnalyzeAnother={onAnalyzeAnother}
        onApply={onApply}
        onViewApplications={onViewApplications}
      />
    </>
  );
}
