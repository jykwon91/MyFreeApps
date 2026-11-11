/** How long an analysis runs before the page says it's taking longer than usual. */
export const ANALYZE_LONG_RUNNING_MS = 3000;

/**
 * What an analysis result says when the posting didn't name the role or the company, or the
 * verdict is one this build doesn't know.
 */
export const JOB_ANALYSIS_FALLBACKS = {
  title: "Untitled role",
  company: "Unknown company",
  verdict: "Analyzed",
} as const;

/** Why an analysis of pasted text failed, when the request reached the server. */
export const JOB_ANALYSIS_ERRORS = {
  aiFailed: "The AI couldn't score this job right now. Try again in a moment.",
  failed: "AI analysis failed. Try again in a moment.",
} as const;
