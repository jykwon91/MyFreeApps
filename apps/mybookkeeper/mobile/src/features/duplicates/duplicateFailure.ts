import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { writeOutcome } from "@platform/core/utils/writeOutcome";
import { DUPLICATES_MESSAGES as MESSAGES } from "../../constants/duplicates";
import type { DuplicateAction } from "../../types/DuplicateAction";

const GONE = "I can't find one of these anymore. It may already have been merged or deleted.";

/** For a change the server says didn't happen, or that a fresh list shows didn't. */
export function duplicateRetryMessage(action: DuplicateAction): string {
  if (action === "merge") return "I couldn't merge those. Want to try again?";
  if (action === "dismiss") return "I couldn't mark those as not duplicates. Want to try again?";
  return "I couldn't resolve that duplicate. Want to try again?";
}

/** A lost answer or a proxy error can come after the change landed (see writeOutcome), so it never says nothing changed. */
export function duplicateFailureMessage(action: DuplicateAction, error: unknown): string {
  if (writeOutcome(error) === "unknown") return MESSAGES.unsure;
  switch (httpStatus(error)) {
    case 403:
      return "You have read-only access, so I can't change these.";
    case 404:
      return GONE;
    case 422:
      return "These can't be merged as picked. Try again, or check the values.";
    default:
      return duplicateRetryMessage(action);
  }
}
