import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import type { DuplicateAction } from "../../types/DuplicateAction";

const GONE = "I can't find one of these anymore. It may already have been merged or deleted.";

export function duplicateFailureMessage(action: DuplicateAction, error: unknown): string {
  switch (httpStatus(error)) {
    case undefined:
      return "I can't reach the server, so nothing changed. Check your connection.";
    case 403:
      return "You have read-only access, so I can't change these.";
    case 404:
      return GONE;
    case 422:
      return "These can't be merged as picked. Try again, or check the values.";
    default:
      if (action === "merge") return "I couldn't merge those. Want to try again?";
      if (action === "dismiss") return "I couldn't mark those as not duplicates. Want to try again?";
      return "I couldn't resolve that duplicate. Want to try again?";
  }
}
