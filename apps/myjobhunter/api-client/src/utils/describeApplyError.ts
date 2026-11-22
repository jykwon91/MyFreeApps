import { getApiValidationDetail } from "@platform/core/utils/apiValidationDetail";
import { isNotFound } from "@platform/core/utils/isNotFound";
import { JOB_ANALYSIS_APPLY_ERRORS } from "../constants/jobAnalysis";

/**
 * What to say when adding an analysis to applications failed. A 404 means the analysis is gone, so
 * it says so and doesn't offer to try again; anything else says what the server gave as the reason,
 * when it gave one, and offers to try again. Shared so the website and the phone say the same thing.
 */
export function describeApplyError(error: unknown): string {
  if (isNotFound(error)) return JOB_ANALYSIS_APPLY_ERRORS.gone;
  const reason = getApiValidationDetail(error, "").trim();
  const { couldntAdd, tryAgain } = JOB_ANALYSIS_APPLY_ERRORS;
  return `${couldntAdd}${reason === "" ? "" : ` (${reason})`}. ${tryAgain}`;
}
