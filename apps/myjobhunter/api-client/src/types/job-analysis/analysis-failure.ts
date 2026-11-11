import type { JobAnalysisSource } from "./job-analysis-source";

/** Why the pending analysis failed, kept so whichever Analyze screen is open can say so. */
export interface AnalysisFailure {
  source: JobAnalysisSource;
  /** A link behind a sign-in: the screen moves to pasting the text and says why. */
  authRequired: boolean;
  /** What to say otherwise (see describeAnalyzeError). */
  message: string;
}
