import { LEASE_MESSAGES } from "../../constants/leases";
import { UPLOAD_MESSAGES } from "../../constants/uploads";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { writeOutcome } from "@platform/core/utils/writeOutcome";

/** A lost answer or a proxy error can come after the file was stored (see writeOutcome), and sending it again adds a second copy. */
export function leaseUploadFailure(error: unknown): string {
  if (writeOutcome(error) === "unknown") return LEASE_MESSAGES.uploadUnsure;
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
