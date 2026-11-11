import { httpStatus } from "@platform/core/utils/httpStatus";
import { JOB_ANALYSIS_ERRORS } from "../constants/jobAnalysis";
import type { JobAnalysisSource } from "../types/job-analysis/job-analysis-source";
import { describeExtractError } from "./describeExtractError";

/**
 * What to say when POST /jobs/analyze failed for a reason other than a sign-in wall (see
 * isAuthRequiredError). A link fails the way reading one for an application does: 504, 502, 429 or
 * 400. Pasted text can only be rate limited (429) or fail at the AI (502). The server's own detail
 * for a 502 carries the AI provider's raw error, so it is never shown.
 */
export function describeAnalyzeError(error: unknown, source: JobAnalysisSource): string {
  const status = httpStatus(error);
  if (source === "url" || status === 429) return describeExtractError(error);
  return status === 502 ? JOB_ANALYSIS_ERRORS.aiFailed : JOB_ANALYSIS_ERRORS.failed;
}
