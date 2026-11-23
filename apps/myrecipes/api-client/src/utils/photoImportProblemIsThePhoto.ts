import { PHOTO_IMPORT_PHOTO_PROBLEM_STATUSES } from "../constants/photoImport";
import { requestErrorStatus } from "./requestErrorStatus";

/**
 * Whether a failed read says the photo itself is the problem (too large, not a photo, no recipe in
 * it). Any other failure (busy, down, offline) can pass, so the same photo is worth another try.
 */
export function photoImportProblemIsThePhoto(error: unknown): boolean {
  const status = requestErrorStatus(error);
  return status !== undefined && PHOTO_IMPORT_PHOTO_PROBLEM_STATUSES.includes(status);
}
