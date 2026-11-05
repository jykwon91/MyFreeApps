import { DEMO_EMAIL_REFUSED } from "@mybookkeeper/api-client/constants/demoRefusal";
import { isDemoRefusal } from "@mybookkeeper/api-client/utils/isDemoRefusal";
import { LEASE_MESSAGES, noEmailForLease } from "../../constants/leases";
import { UPLOAD_MESSAGES } from "../../constants/uploads";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { isMissingTenantEmail } from "./extendLeaseFailure";

export function emailLeaseFailure(error: unknown, tenantName: string | null): string {
  if (isMissingTenantEmail(error)) return noEmailForLease(tenantName);
  switch (httpStatus(error)) {
    case undefined:
      return LEASE_MESSAGES.emailUnsure;
    case 403:
      return isDemoRefusal(error) ? DEMO_EMAIL_REFUSED : UPLOAD_MESSAGES.notAllowed;
    case 404:
      return LEASE_MESSAGES.goneWhileChanging;
    default:
      return LEASE_MESSAGES.emailFailed;
  }
}
