import { REFINEMENT_FAILURES } from "@myjobhunter/api-client/constants/refinementFailures";
import { isSuggestionChangedError } from "@myjobhunter/api-client/utils/isSuggestionChangedError";
import { rateLimitedMessage } from "@myjobhunter/api-client/utils/rateLimitedMessage";
import { isNotFound } from "@platform/core/utils/isNotFound";
import { RESUME_MESSAGES as MESSAGES } from "../constants/resume";

/**
 * What to say when a refinement action fails: the rate limit, an answer to a suggestion that had already moved on,
 * a session that's gone, or else `failed`. Never the server's own words.
 */
export function refinementFailure(error: unknown, failed: string = MESSAGES.actionFailed): string {
  if (isSuggestionChangedError(error)) return REFINEMENT_FAILURES.suggestionChanged;
  return rateLimitedMessage(error, "resumeRefinement") ?? (isNotFound(error) ? MESSAGES.sessionGone : failed);
}
