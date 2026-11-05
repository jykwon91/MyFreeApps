import type { ReplyTemplateFailure } from "../types/inquiry/reply-template-failure";
import { httpStatus } from "./httpStatus";

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
      return status >= 500 ? "serverError" : "other";
  }
}

export function archiveFailure(error: unknown): ReplyTemplateFailure {
  const failure = saveFailure(error);
  return failure === "nameTaken" || failure === "serverError" ? "other" : failure;
}

/** A restore can't clash on its name, and a 5xx may follow a restore that went through. */
export function restoreFailure(error: unknown): ReplyTemplateFailure {
  const failure = saveFailure(error);
  return failure === "nameTaken" ? "other" : failure;
}
