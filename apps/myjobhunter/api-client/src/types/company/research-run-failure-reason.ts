/**
 * Why a research run failed: `not-configured` (a 503: the server has no search key, so retrying
 * can't help), `company-gone` (a 404), or `retryable` (502/504 from the AI or search, or anything else).
 */
export type ResearchRunFailureReason = "not-configured" | "company-gone" | "retryable";
