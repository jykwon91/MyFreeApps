import type { JobAnalysis } from "@myjobhunter/api-client/types/job-analysis/job-analysis";

export interface AnalysisResultProps {
  analysis: JobAnalysis;
  isApplying: boolean;
  onApply: () => Promise<void>;
  onAnalyzeAnother: () => void;
  onViewApplications: () => void;
}
