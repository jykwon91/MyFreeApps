import { rateLimitedMessage } from "@myjobhunter/api-client/utils/rateLimitedMessage";
import { isNotFound } from "@platform/core/utils/isNotFound";
import { RESUME_MESSAGES as MESSAGES } from "../constants/resume";

/** What to say when a refinement action fails: the rate limit, a session that's gone, or else `failed`. Never the server's own words. */
export function refinementFailure(error: unknown, failed: string = MESSAGES.actionFailed): string {
  return rateLimitedMessage(error, "resumeRefinement") ?? (isNotFound(error) ? MESSAGES.sessionGone : failed);
}
