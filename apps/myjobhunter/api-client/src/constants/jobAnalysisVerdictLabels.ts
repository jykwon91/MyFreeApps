import type { JobAnalysisVerdict } from "../types/job-analysis/job-analysis-verdict";

/** Display label per verdict — used in the verdict banner. */
export const VERDICT_LABELS: Record<JobAnalysisVerdict, string> = {
  strong_fit: "Strong fit",
  worth_considering: "Worth considering",
  stretch: "Stretch",
  mismatch: "Mismatch",
};
