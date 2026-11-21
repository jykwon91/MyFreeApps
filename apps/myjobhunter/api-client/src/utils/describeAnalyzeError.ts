import { httpStatus } from "@platform/core/utils/httpStatus";
import { isNoResponse } from "@platform/core/utils/isNoResponse";
import { JOB_ANALYSIS_ERRORS, JOB_ANALYSIS_NO_CONNECTION } from "../constants/jobAnalysis";
import type { JobAnalysisSource } from "../types/job-analysis/job-analysis-source";
import { describeExtractError } from "./describeExtractError";

/**
 * What to say when POST /jobs/analyze failed for a reason other than a sign-in wall (see
 * isAuthRequiredError). A link fails the way reading one for an application does: 504, 502, 429 or
 * 400. Pasted text can only be rate limited (429) or fail at the AI (502). The status alone picks
 * the wording, so it stays the same whatever the server's detail says.
 */
export function describeAnalyzeError(error: unknown, source: JobAnalysisSource): string {
  if (isNoResponse(error)) return JOB_ANALYSIS_NO_CONNECTION;
  const status = httpStatus(error);
  if (source === "url" || status === 429) return describeExtractError(error);
  return status === 502 ? JOB_ANALYSIS_ERRORS.aiFailed : JOB_ANALYSIS_ERRORS.failed;
}
