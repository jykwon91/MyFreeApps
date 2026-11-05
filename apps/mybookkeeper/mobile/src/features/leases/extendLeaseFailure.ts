import { DEMO_EXTEND_REFUSED } from "@mybookkeeper/api-client/constants/demoRefusal";
import { isDemoRefusal } from "@mybookkeeper/api-client/utils/isDemoRefusal";
import { LEASE_MESSAGES } from "../../constants/leases";
import { UPLOAD_MESSAGES } from "../../constants/uploads";
import { httpStatus } from "../transactions/transactionMessages";
import { leaseConflictCode } from "./leaseConflictCode";

export function isMissingTenantEmail(error: unknown): boolean {
  return (error as { data?: { detail?: unknown } } | null)?.data?.detail === "applicant_email_missing";
}

/** Null when the answer doesn't say whether the extension went through, or names a date to check. */
export function extendLeaseFailure(error: unknown): string | null {
  switch (httpStatus(error)) {
    case 403:
      return isDemoRefusal(error) ? DEMO_EXTEND_REFUSED : UPLOAD_MESSAGES.notAllowed;
    case 404:
      return LEASE_MESSAGES.goneWhileChanging;
    case 409:
      if (leaseConflictCode(error) === "INVALID_STATUS_FOR_EXTENSION") return LEASE_MESSAGES.extendWrongStatus;
      return leaseConflictCode(error) === "MISSING_CURRENT_END_DATE" ? LEASE_MESSAGES.extendNoEndDate : null;
    case 422:
      return isMissingTenantEmail(error) ? LEASE_MESSAGES.extendNoEmail : LEASE_MESSAGES.extendCheckFields;
    default:
      return null;
  }
}
