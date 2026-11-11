import type { AnalysisFailure } from "./analysis-failure";
import type { JobAnalysis } from "./job-analysis";
import type { PendingAnalysis } from "./pending-analysis";

/** Redux state for the job analysis (see store/jobAnalysisSlice). */
export interface JobAnalysisState {
  lastResult: JobAnalysis | null;
  /** The analysis still running, which a screen opened mid-wait shows; null when none is. */
  pending: PendingAnalysis | null;
  /** Why the last pending analysis failed, until a screen has shown it; null otherwise. */
  failure: AnalysisFailure | null;
}
