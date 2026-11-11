import type { JobAnalysisVerdict } from "../types/job-analysis/job-analysis-verdict";
import type { StatusTone } from "../types/status-tone";

/** The tone of each verdict's badge on a board card. */
export const VERDICT_TONES: Record<JobAnalysisVerdict, StatusTone> = {
  strong_fit: "success",
  worth_considering: "info",
  stretch: "warning",
  mismatch: "danger",
};
