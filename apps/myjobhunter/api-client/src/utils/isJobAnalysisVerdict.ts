import { VERDICT_LABELS } from "../constants/jobAnalysisVerdictLabels";
import type { JobAnalysisVerdict } from "../types/job-analysis/job-analysis-verdict";

/** True for a verdict this client knows; stored rows may carry one added later on the backend. */
export function isJobAnalysisVerdict(value: string): value is JobAnalysisVerdict {
  return Object.prototype.hasOwnProperty.call(VERDICT_LABELS, value);
}
