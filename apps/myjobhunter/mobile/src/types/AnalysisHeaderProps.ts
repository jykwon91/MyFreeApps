import type { JobAnalysisExtracted } from "@myjobhunter/api-client/types/job-analysis/job-analysis-extracted";

export interface AnalysisHeaderProps {
  extracted: JobAnalysisExtracted;
  sourceUrl: string | null;
}
