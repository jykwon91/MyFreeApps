import { errorDetail } from "./errorDetail";
import { httpStatus } from "./httpStatus";

/** The server's reason for refusing to combine duplicates linked to different tenants, vendors or activities. */
export function duplicateConflictMessage(error: unknown): string | null {
  if (httpStatus(error) !== 409) return null;
  const detail = errorDetail(error);
  return typeof detail === "string" && detail ? detail : null;
}
