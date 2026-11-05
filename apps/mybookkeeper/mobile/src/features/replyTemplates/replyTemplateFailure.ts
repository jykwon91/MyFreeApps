import { REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";
import type { ReplyTemplateFailure } from "../../types/ReplyTemplateFailure";
import { httpStatus } from "../transactions/transactionMessages";

/** The server's own wording is never shown, so only the status is read. */
export function saveFailure(error: unknown): ReplyTemplateFailure {
  const status = httpStatus(error);
  switch (status) {
    case undefined:
      return "noResponse";
    case 403:
      return "viewOnly";
    case 404:
      return "gone";
    case 409:
      return "nameTaken";
    default:
      // A 5xx can come from the proxy after the server has already saved.
      return status !== undefined && status >= 500 ? "serverError" : "other";
  }
}

export function archiveFailure(error: unknown): ReplyTemplateFailure {
  const failure = saveFailure(error);
  return failure === "nameTaken" || failure === "serverError" ? "other" : failure;
}

/** The banner for a failure, or null when it shows somewhere else. */
export function saveBanner(failure: ReplyTemplateFailure): string | null {
  switch (failure) {
    case "noResponse":
      return REPLY_TEMPLATE_MESSAGES.couldntReach;
    case "viewOnly":
      return REPLY_TEMPLATE_MESSAGES.saveViewOnly;
    case "unsure":
      return REPLY_TEMPLATE_MESSAGES.saveUnsure;
    case "serverError":
    case "other":
      return REPLY_TEMPLATE_MESSAGES.saveFailed;
    case "nameTaken":
    case "gone":
      return null;
  }
}
