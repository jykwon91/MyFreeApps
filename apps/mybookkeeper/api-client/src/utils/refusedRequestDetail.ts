import { getApiValidationDetail } from "@platform/core/utils/apiValidationDetail";
import { httpStatus } from "./httpStatus";

const EXPLAINED_STATUSES: ReadonlySet<number> = new Set([409, 422, 429]);

/**
 * The server's own reason for refusing a request it understood — a conflict (409), a bad value (422)
 * or a limit (429). Any other failure gets `fallback`: a 500's detail is a developer string, not a reason.
 */
export function refusedRequestDetail(error: unknown, fallback: string): string {
  const status = httpStatus(error);
  if (status === undefined || !EXPLAINED_STATUSES.has(status)) return fallback;
  return getApiValidationDetail(error, fallback);
}
