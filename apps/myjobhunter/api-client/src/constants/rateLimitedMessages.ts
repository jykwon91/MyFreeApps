import type { RateLimitedAction } from "../types/rate-limited-action";

/**
 * What to say when the server answers 429 to a paid AI action. The server sends no Retry-After, so
 * none of these names a time beyond "a few minutes".
 */
export const RATE_LIMITED_MESSAGES: Record<RateLimitedAction, string> = {
  companyResearch: "You've run a lot of company research recently. Try again in a few minutes.",
  resumeUpload: "You've uploaded a lot of resumes recently. Try again in a few minutes.",
  resumeRefinement: "You've made a lot of resume refinement requests recently. Try again in a few minutes.",
  jobPosting: "You've looked up a lot of job postings recently. Try again in a few minutes.",
};
