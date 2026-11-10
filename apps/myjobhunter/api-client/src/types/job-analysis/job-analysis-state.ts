import type { JobAnalysis } from "./job-analysis";

/** Redux state for the last job-analysis result (see store/jobAnalysisSlice). */
export interface JobAnalysisState {
  lastResult: JobAnalysis | null;
}
