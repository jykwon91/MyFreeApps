import { LEASE_ATTACHMENT_LOCKED_MESSAGE } from "@mybookkeeper/api-client/constants/leaseDocumentsLocked";
import { attachmentBacksExtension } from "@mybookkeeper/api-client/utils/attachmentBacksExtension";
import { isLeaseAttachmentLockedFailure } from "@mybookkeeper/api-client/utils/isLeaseAttachmentLockedFailure";
import { writeFailure } from "@mybookkeeper/api-client/utils/writeFailure";
import { LEASE_FILE_MESSAGES } from "../../constants/leaseFiles";
import { deleteFailureCopy, saveFailureCopy } from "../../lib/writeFailureCopy";

const CHANGE_COPY = saveFailureCopy("file", "files", false);
const REMOVE_COPY = deleteFailureCopy("file");

/** A file the extension record rests on is refused for its own reason, which is worth saying. */
export function changeFileTypeFailure(error: unknown): string {
  if (isLeaseAttachmentLockedFailure(error)) return LEASE_ATTACHMENT_LOCKED_MESSAGE;
  return attachmentBacksExtension(error) ? LEASE_FILE_MESSAGES.backsExtension : CHANGE_COPY[writeFailure(error)];
}

export function removeFileFailure(error: unknown): string {
  if (isLeaseAttachmentLockedFailure(error)) return LEASE_ATTACHMENT_LOCKED_MESSAGE;
  return attachmentBacksExtension(error) ? LEASE_FILE_MESSAGES.backsExtension : REMOVE_COPY[writeFailure(error)];
}
