import { LEASE_ATTACHMENT_LOCKED_CODE } from "../constants/leaseDocumentsLocked";
import { errorDetail } from "./errorDetail";
import { httpStatus } from "./httpStatus";

/** The server refused to delete or relabel a locked lease's original or signed file. */
export function isLeaseAttachmentLockedFailure(error: unknown): boolean {
  return httpStatus(error) === 409 && (errorDetail(error) as { code?: unknown } | undefined)?.code === LEASE_ATTACHMENT_LOCKED_CODE;
}
