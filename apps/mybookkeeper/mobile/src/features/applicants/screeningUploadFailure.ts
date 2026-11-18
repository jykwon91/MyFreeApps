import { SCREENING_MESSAGES } from "../../constants/applicantScreening";
import { UPLOAD_MESSAGES } from "../../constants/uploads";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { writeOutcome } from "@platform/core/utils/writeOutcome";

/** A lost answer or a proxy error can come after the result was saved (see writeOutcome), and sending it again adds a second one. */
export function screeningUploadFailure(error: unknown): string {
  if (writeOutcome(error) === "unknown") return SCREENING_MESSAGES.uploadUnsure;
  switch (httpStatus(error)) {
    case 403:
      return UPLOAD_MESSAGES.notAllowed;
    case 413:
      return SCREENING_MESSAGES.tooBig;
    case 415:
      return SCREENING_MESSAGES.badFile;
    case 422:
      return SCREENING_MESSAGES.needsReason;
    case 503:
      return SCREENING_MESSAGES.storageDown;
    default:
      return SCREENING_MESSAGES.uploadFailed;
  }
}
