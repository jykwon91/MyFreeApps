import { LEASE_VALUE_LOCKED_CODE } from "../constants/leaseDocumentsLocked";
import { errorDetail } from "./errorDetail";
import { httpStatus } from "./httpStatus";

/** The server refused to change a value a sent, emailed or signed lease already holds, told apart from other 422s by its code. */
export function isLeaseValueLockedFailure(error: unknown): boolean {
  return httpStatus(error) === 422 && (errorDetail(error) as { code?: unknown } | undefined)?.code === LEASE_VALUE_LOCKED_CODE;
}
