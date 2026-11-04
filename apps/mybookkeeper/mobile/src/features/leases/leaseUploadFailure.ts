import { LEASE_MESSAGES } from "../../constants/leases";
import { UPLOAD_MESSAGES } from "../../constants/uploads";
import { httpStatus } from "../transactions/transactionMessages";

export function leaseUploadFailure(error: unknown): string {
  switch (httpStatus(error)) {
    case 403:
      return UPLOAD_MESSAGES.notAllowed;
    case 404:
      return LEASE_MESSAGES.goneWhileAdding;
    case 413:
      return LEASE_MESSAGES.tooBig;
    case 415:
      return LEASE_MESSAGES.badFile;
    case 503:
      return LEASE_MESSAGES.storageDown;
    default:
      return LEASE_MESSAGES.uploadFailed;
  }
}
