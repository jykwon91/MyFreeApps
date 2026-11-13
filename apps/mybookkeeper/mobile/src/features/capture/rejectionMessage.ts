import { documentUploadProblemMessage } from "@mybookkeeper/api-client/utils/documentUploadFile";
import type { ApiError } from "@platform/core/types/api-error";
import { REQUEST_TOO_LARGE_STATUS, UPLOAD_REFUSED_REASON } from "../../constants/capture";

/** A 413 comes from the proxy with no body, so it's named here rather than left to a reason the server never sent. */
export function rejectionMessage(fileName: string, error: ApiError): string {
  if (error.status === REQUEST_TOO_LARGE_STATUS) return documentUploadProblemMessage(fileName, "tooBig");
  const data = error.data as { detail?: unknown } | undefined;
  const reason = typeof data?.detail === "string" ? data.detail : UPLOAD_REFUSED_REASON;
  return `I couldn't send ${fileName}. ${reason}`;
}
