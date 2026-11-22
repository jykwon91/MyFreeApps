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

/** What to say when reading a posting or scoring a job got no answer at all: not the link's or the AI's fault. */
export const JOB_ANALYSIS_NO_CONNECTION = "I can't reach the server. Check your connection and try again.";

/** Why an analysis of pasted text failed, when the request reached the server. */
export const JOB_ANALYSIS_ERRORS = {
  aiFailed: "The AI couldn't score this job right now. Try again in a moment.",
  failed: "AI analysis failed. Try again in a moment.",
} as const;

/**
 * When adding an analysis to applications lost its answer and the server couldn't be asked whether it went through. Adding
 * the same analysis again returns the application it already made, so trying again is safe.
 */
export const JOB_ANALYSIS_APPLY_UNSURE = "I'm not sure it was added to your applications. Trying again won't add it twice.";

/** What to say when adding an analysis to applications failed and the request reached the server. */
export const JOB_ANALYSIS_APPLY_ERRORS = {
  /** The analysis no longer exists, so adding it again can't work: no offer to retry. */
  gone: "I couldn't add it: this analysis is gone. Analyze the job again to add it.",
  couldntAdd: "I couldn't add it to your applications",
  tryAgain: "Want to try again?",
} as const;
