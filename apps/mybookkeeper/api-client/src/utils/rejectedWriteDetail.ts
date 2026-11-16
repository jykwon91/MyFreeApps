import { getApiValidationDetail } from "./apiValidationDetail";
import { httpStatus } from "./httpStatus";

/**
 * The server's own reason for refusing a write (422), such as "Use dollars and cents, like 84.20.".
 * Any other failure gets `fallback`: a 500's detail is a developer string, not a reason.
 */
export function rejectedWriteDetail(error: unknown, fallback: string): string {
  return httpStatus(error) === 422 ? getApiValidationDetail(error, fallback) : fallback;
}
