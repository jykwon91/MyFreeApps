import { documentUploadProblemMessage } from "@mybookkeeper/api-client/utils/documentUploadFile";
import { getApiValidationDetail } from "@platform/core/utils/apiValidationDetail";
import type { ApiError } from "@platform/core/types/api-error";
import { REQUEST_TOO_LARGE_STATUS, UPLOAD_REFUSED_REASON } from "../../constants/capture";

/** A 413 comes from the proxy with no body, so it's named here rather than left to a reason the server never sent. */
export function rejectionMessage(fileName: string, error: ApiError): string {
  if (error.status === REQUEST_TOO_LARGE_STATUS) return documentUploadProblemMessage(fileName, "tooBig");
  return `I couldn't send ${fileName}. ${getApiValidationDetail(error, UPLOAD_REFUSED_REASON)}`;
}
