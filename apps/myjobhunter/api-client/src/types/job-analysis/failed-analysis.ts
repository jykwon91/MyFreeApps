import type { AnalysisFailure } from "./analysis-failure";

/** An analysis that failed, with the request it answers. */
export interface FailedAnalysis {
  requestId: string;
  failure: AnalysisFailure;
}
