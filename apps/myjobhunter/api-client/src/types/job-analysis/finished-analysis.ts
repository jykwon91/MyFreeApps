import type { JobAnalysis } from "./job-analysis";

/** An analysis that came back, with the request it answers. */
export interface FinishedAnalysis {
  requestId: string;
  analysis: JobAnalysis;
}
