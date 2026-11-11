import type { JobAnalysisSource } from "./job-analysis-source";

/** The analysis being waited for. Only its answer is kept; any other that comes in is ignored. */
export interface PendingAnalysis {
  /** The RTK Query request id of the analyze mutation. */
  requestId: string;
  source: JobAnalysisSource;
  /** `Date.now()` when it was sent, so a screen opened mid-wait knows when it turns slow. */
  startedAt: number;
}
