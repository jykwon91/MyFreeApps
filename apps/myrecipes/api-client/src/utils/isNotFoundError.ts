import { requestErrorStatus } from "./requestErrorStatus";

/** A recipe that's gone, or a link with a malformed id. A dropped connection has no status. */
export function isNotFoundError(error: unknown): boolean {
  const status = requestErrorStatus(error);
  return status === 404 || status === 422;
}
