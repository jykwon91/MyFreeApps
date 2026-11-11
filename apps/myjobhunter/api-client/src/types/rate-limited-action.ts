/** A paid AI action the server limits per user; each has its own 429 copy. */
export type RateLimitedAction = "companyResearch" | "resumeUpload" | "resumeRefinement" | "jobPosting";
