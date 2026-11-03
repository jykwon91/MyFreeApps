import type { ApiError } from "@platform/core/types/api-error";
import type { SerializedError } from "@reduxjs/toolkit";

/** A recipe that's gone, or a link with a malformed id. A dropped connection has no status. */
export function isNotFoundError(error: ApiError | SerializedError | undefined): boolean {
  return !!error && "status" in error && (error.status === 404 || error.status === 422);
}
