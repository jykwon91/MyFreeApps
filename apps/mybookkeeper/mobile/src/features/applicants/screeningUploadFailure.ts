import { SCREENING_MESSAGES } from "../../constants/applicantScreening";
import { UPLOAD_MESSAGES } from "../../constants/uploads";
import { httpStatus } from "../transactions/transactionMessages";

export function screeningUploadFailure(error: unknown): string {
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
