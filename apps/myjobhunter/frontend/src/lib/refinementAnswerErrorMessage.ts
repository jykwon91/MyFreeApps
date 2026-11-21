import { REFINEMENT_FAILURES } from "@myjobhunter/api-client/constants/refinementFailures";
import { isSuggestionChangedError } from "@myjobhunter/api-client/utils/isSuggestionChangedError";
import { repeatableWriteFailure } from "@myjobhunter/api-client/utils/repeatableWriteFailure";
import { aiActionErrorMessage } from "@/lib/aiActionErrorMessage";

/**
 * What a toast says when an answer to a suggestion failed. A lost reply may have gone through, and answering again is
 * safe (the server refuses an answer to a suggestion that has moved on), so it says that, in the phone's words. Otherwise:
 * that the suggestion had already moved on (nothing was applied, and the current one is reloading), or else as any paid
 * AI action. Null when a cache reset (sign-out) called it off.
 */
export function refinementAnswerErrorMessage(error: unknown): string | null {
  return repeatableWriteFailure(error, (refusal) =>
    isSuggestionChangedError(refusal) ? REFINEMENT_FAILURES.suggestionChanged : aiActionErrorMessage(refusal, "resumeRefinement"),
  );
}
