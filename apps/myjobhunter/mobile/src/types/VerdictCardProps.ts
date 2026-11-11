import type { JobAnalysisVerdict } from "@myjobhunter/api-client/types/job-analysis/job-analysis-verdict";

export interface VerdictCardProps {
  verdict: JobAnalysisVerdict;
  summary: string;
}
