import { RATE_LIMITED_MESSAGES } from "../constants/rateLimitedMessages";

/**
 * What to say when reading a job-posting link failed for a reason other than a sign-in wall.
 * POST /applications/extract-from-url answers 504 (timed out), 502 (upstream or AI failure),
 * 429 (rate limited) or 400 (malformed URL).
 */
export function describeExtractError(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const { status } = err as { status?: unknown };
    if (status === 504) return "The page took too long to load. Try again or paste the description text.";
    if (status === 502) return "Couldn't extract the job description from that page. Paste the description text instead.";
    if (status === 429) return RATE_LIMITED_MESSAGES.jobPosting;
    if (status === 400) return "That URL doesn't look right. Make sure it starts with http:// or https://.";
  }
  return "Couldn't fetch that URL. Paste the description text instead.";
}
