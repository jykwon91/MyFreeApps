import { isNotFoundError } from "./isNotFoundError";
import { requestErrorStatus } from "./requestErrorStatus";

/** Whether asking for a comparison again could work: not when the link names a version that isn't there or isn't this recipe's. */
export function isRetryableDiffError(error: unknown): boolean {
  return !isNotFoundError(error) && requestErrorStatus(error) !== 400;
}
