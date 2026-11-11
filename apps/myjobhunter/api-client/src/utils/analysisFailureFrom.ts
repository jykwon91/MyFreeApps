import type { AnalysisFailure } from "../types/job-analysis/analysis-failure";
import type { JobAnalysisSource } from "../types/job-analysis/job-analysis-source";
import { describeAnalyzeError } from "./describeAnalyzeError";
import { isAuthRequiredError } from "./isAuthRequiredError";

/** A failed POST /jobs/analyze, as the slice keeps it: plain data, not the error itself. */
export function analysisFailureFrom(error: unknown, source: JobAnalysisSource): AnalysisFailure {
  return {
    source,
    authRequired: source === "url" && isAuthRequiredError(error),
    message: describeAnalyzeError(error, source),
  };
}
