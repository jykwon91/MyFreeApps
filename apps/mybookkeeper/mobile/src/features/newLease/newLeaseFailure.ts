import { NEW_LEASE_MESSAGES as MESSAGES } from "../../constants/newLease";
import { UPLOAD_MESSAGES } from "../../constants/uploads";
import { leaseConflictCode } from "../leases/leaseConflictCode";
import { httpStatus } from "../transactions/transactionMessages";

/** The server's 422 for a required value is a plain sentence; a rule it checks has a code. */
export function isOutOfDateForm(error: unknown): boolean {
  return httpStatus(error) === 422 && leaseConflictCode(error) === null;
}

/** Creating a lease isn't safe to repeat blindly, so a lost answer has to say so. */
export function newLeaseFailure(error: unknown): string {
  if (leaseConflictCode(error) === "INVALID_PARENT_LEASE") return MESSAGES.invalidParent;
  const status = httpStatus(error);
  if (status === 403) return UPLOAD_MESSAGES.notAllowed;
  if (status === 404) return MESSAGES.notFound;
  if (status === 422) return MESSAGES.needMoreAnswers;
  // No answer, or the server broke partway: either way the draft may exist.
  if (status === undefined || status >= 500) return MESSAGES.unsure;
  return MESSAGES.refused;
}
