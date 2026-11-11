import type { JobAnalysisSource } from "@myjobhunter/api-client/types/job-analysis/job-analysis-source";

export interface AnalyzeProgressProps {
  /** A link is read before it's scored, so its wait says so. */
  source: JobAnalysisSource;
  isLongRunning: boolean;
  onCancel: () => void;
}
