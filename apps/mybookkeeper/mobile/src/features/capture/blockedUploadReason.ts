import { isDemoRefusal } from "@mybookkeeper/api-client/utils/isDemoRefusal";
import type { ApiError } from "@platform/core/types/api-error";
import { FORBIDDEN_STATUS, NOT_FOUND_STATUS, UPLOAD_BLOCKED_REASONS } from "../../constants/capture";

/** Why this person can't add documents here at all, or null when the answer doesn't say so. */
export function blockedUploadReason(error: ApiError): string | null {
  if (error.status === FORBIDDEN_STATUS) return isDemoRefusal(error) ? UPLOAD_BLOCKED_REASONS.demo : UPLOAD_BLOCKED_REASONS.viewOnly;
  if (error.status === NOT_FOUND_STATUS) return UPLOAD_BLOCKED_REASONS.workspaceGone;
  return null;
}
