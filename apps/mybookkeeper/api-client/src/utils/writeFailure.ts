import type { WriteFailure } from "../types/write/write-failure";
import { httpStatus } from "./httpStatus";
import { isDemoRefusal } from "./isDemoRefusal";

/** The server's own wording is never shown. Only the status is read, plus the one 403 that means "demo workspace" rather than "viewer". */
export function writeFailure(error: unknown): WriteFailure {
  const status = httpStatus(error);
  switch (status) {
    case undefined:
      return "noResponse";
    case 403:
      return isDemoRefusal(error) ? "demo" : "viewOnly";
    case 404:
      return "gone";
    case 409:
      return "conflict";
    case 422:
      return "invalid";
    default:
      return status >= 500 ? "serverError" : "other";
  }
}
