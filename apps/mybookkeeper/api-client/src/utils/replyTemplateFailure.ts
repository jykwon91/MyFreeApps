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
