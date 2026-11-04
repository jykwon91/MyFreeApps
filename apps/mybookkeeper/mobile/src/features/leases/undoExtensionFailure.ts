import { LEASE_MESSAGES } from "../../constants/leases";
import { UPLOAD_MESSAGES } from "../../constants/uploads";
import { httpStatus } from "../transactions/transactionMessages";
import { leaseConflictCode } from "./leaseConflictCode";

/** Null when the answer doesn't say whether the undo went through. */
export function undoExtensionFailure(error: unknown): string | null {
  switch (httpStatus(error)) {
    case 403:
      return UPLOAD_MESSAGES.notAllowed;
    case 404:
      return LEASE_MESSAGES.undoAlreadyDone;
    case 409:
      if (leaseConflictCode(error) === "UNDO_WINDOW_EXPIRED") return LEASE_MESSAGES.undoExpired;
      return leaseConflictCode(error) === "NOT_LATEST_EXTENSION" ? LEASE_MESSAGES.undoNotLatest : LEASE_MESSAGES.undoFailed;
    default:
      return null;
  }
}
