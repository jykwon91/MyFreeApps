import { LEASE_DOCUMENTS_LOCKED_CODE } from "../constants/leaseDocumentsLocked";
import { errorDetail } from "./errorDetail";
import { httpStatus } from "./httpStatus";

/** The server refused to make a locked lease's documents again, told apart from other 409s by its code. */
export function isLeaseDocumentsLockedFailure(error: unknown): boolean {
  return httpStatus(error) === 409 && (errorDetail(error) as { code?: unknown } | undefined)?.code === LEASE_DOCUMENTS_LOCKED_CODE;
}
