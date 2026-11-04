import { LEASE_MESSAGES, noEmailForLease } from "../../constants/leases";
import { UPLOAD_MESSAGES } from "../../constants/uploads";
import { httpStatus } from "../transactions/transactionMessages";
import { isMissingTenantEmail } from "./extendLeaseFailure";

export function emailLeaseFailure(error: unknown, tenantName: string | null): string {
  if (isMissingTenantEmail(error)) return noEmailForLease(tenantName);
  switch (httpStatus(error)) {
    case undefined:
      return LEASE_MESSAGES.emailUnsure;
    case 403:
      return UPLOAD_MESSAGES.notAllowed;
    case 404:
      return LEASE_MESSAGES.goneWhileChanging;
    default:
      return LEASE_MESSAGES.emailFailed;
  }
}
