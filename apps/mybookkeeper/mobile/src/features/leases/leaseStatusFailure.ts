import { LEASE_MESSAGES } from "../../constants/leases";
import { UPLOAD_MESSAGES } from "../../constants/uploads";
import { httpStatus } from "../transactions/transactionMessages";

export function leaseStatusFailure(error: unknown): string {
  switch (httpStatus(error)) {
    case 400:
      return LEASE_MESSAGES.statusMovedOn;
    case 403:
      return UPLOAD_MESSAGES.notAllowed;
    case 404:
      return LEASE_MESSAGES.goneWhileChanging;
    default:
      return LEASE_MESSAGES.statusFailed;
  }
}
