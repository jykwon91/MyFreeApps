/**
 * The result step of /analyze: the role, the verdict, each dimension and its
 * flags, then what to do next.
 */
import { Sparkles } from "lucide-react";
import AnalysisActions from "@/features/analyze/AnalysisActions";
import DimensionsTable from "@/features/analyze/DimensionsTable";
import JobAnalysisHeader from "@/features/analyze/JobAnalysisHeader";
import VerdictBanner from "@/features/analyze/VerdictBanner";
import type { JobAnalysis } from "@myjobhunter/api-client/types/job-analysis/job-analysis";

interface AnalyzeResultViewProps {
  analysis: JobAnalysis;
  applying: boolean;
  onApply: () => void;
  onAnalyzeAnother: () => void;
  onViewApplications: () => void;
}

export default function AnalyzeResultView({
  analysis,
  applying,
  onApply,
  onAnalyzeAnother,
  onViewApplications,
}: AnalyzeResultViewProps) {
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles size={14} aria-hidden="true" />
        <span>Analyzed against your profile</span>
      </div>

      <JobAnalysisHeader
        extracted={analysis.extracted}
        sourceUrl={analysis.source_url}
      />
      <VerdictBanner
        verdict={analysis.verdict}
        summary={analysis.verdict_summary}
      />
      <DimensionsTable
        dimensions={analysis.dimensions}
        redFlags={analysis.red_flags}
        greenFlags={analysis.green_flags}
      />
      <AnalysisActions
        appliedApplicationId={analysis.applied_application_id}
        applying={applying}
        onApply={onApply}
        onAnalyzeAnother={onAnalyzeAnother}
        onViewApplications={onViewApplications}
      />
    </div>
  );
}
