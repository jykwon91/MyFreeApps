import { writeOutcome } from "@platform/core/utils/writeOutcome";
import type { WriteFailure } from "../types/write/write-failure";
import { httpStatus } from "./httpStatus";
import { isDemoRefusal } from "./isDemoRefusal";

/**
 * The server's own wording is never shown. Only the status is read, plus the one 403 that means "demo workspace" rather than "viewer".
 * "noResponse" and "serverError" are the failures after which the write may still have gone through (see writeOutcome).
 */
export function writeFailure(error: unknown): WriteFailure {
  const status = httpStatus(error);
  if (typeof status !== "number") return "noResponse";
  if (writeOutcome(error) === "unknown") return "serverError";
  switch (status) {
    case 403:
      return isDemoRefusal(error) ? "demo" : "viewOnly";
    case 404:
      return "gone";
    case 409:
      return "conflict";
    case 413:
      return "tooLarge";
    case 422:
      return "invalid";
    case 429:
      return "rateLimited";
    default:
      return "other";
  }
}
