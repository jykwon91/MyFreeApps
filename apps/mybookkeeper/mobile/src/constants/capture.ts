import { DOCUMENT_UPLOAD_KINDS_LABEL, DOCUMENT_UPLOAD_MAX_LABEL, DOCUMENT_UPLOAD_MIME_TYPES } from "@mybookkeeper/api-client/constants/documentUpload";
import { UPLOAD_OUTCOME_MESSAGES } from "@mybookkeeper/api-client/constants/uploadOutcomeMessages";
import type { UploadFileProgress } from "../types/UploadFileProgress";

export const MAX_FILES_AT_ONCE = 10;
export const PHOTO_LONGEST_SIDE = 2000;
export const PHOTO_JPEG_QUALITY = 0.7;
export const SHUTTER_SIZE = 72;
export const UPLOAD_QUEUE_DIRECTORY = "upload-queue";
/** Two in a row means the connection is down, so the rest aren't tried. One may just be a file too big for a slow link. */
export const NETWORK_FAILURES_BEFORE_STOP = 2;
export const SENT_MESSAGE_MS = 5000;
export const SENDING_MESSAGE = "Sending…";
export const SENT_MESSAGE = "Got it. I'm reading it now.";
export const REQUEST_TOO_LARGE_STATUS = 413;
export const BAD_REQUEST_STATUS = 400;
export const UNAUTHORIZED_STATUS = 401;
export const FORBIDDEN_STATUS = 403;
export const NOT_FOUND_STATUS = 404;
export const CONFLICT_STATUS = 409;
/** The statuses that mean this file is the problem. Others say nothing about it, so it's kept. */
export const FILE_REJECTED_STATUSES: readonly number[] = [BAD_REQUEST_STATUS, REQUEST_TOO_LARGE_STATUS, 415, 422, CONFLICT_STATUS];
export const LIMIT_REACHED_STATUS = 429;
export const SERVER_ERROR_STATUS = 500;
export const UPLOAD_PROGRESS_BAR_HEIGHT = 4;
export const UPLOAD_COMPLETE_PERCENT = 100;
/** Every byte is out, and the server has yet to answer. */
export const UPLOAD_PROCESSING_LABEL = "Processing…";
export const UPLOAD_REFUSED_REASON = "The server wouldn't take it.";
/** Why nothing can be sent from here, as opposed to the server being out of reach. These won't change on a retry. */
export const UPLOAD_BLOCKED_REASONS = {
  viewOnly: "You have view-only access in this workspace, so I can't add documents.",
  demo: "Demo workspaces can't add documents.",
  workspaceGone: "I can't find this workspace anymore, so I can't add documents to it.",
} as const;
export const SIGN_IN_AGAIN_MESSAGE = "Your session has ended. Your files are saved here, and I'll send them once you sign in again.";
export const REMOVE_BLOCKED_FILES_LABEL = "Remove them";
export const KEEP_BLOCKED_FILES_LABEL = "Keep them";
/** How often a sent file or zip being read is checked on, the same as on the web. */
export const READ_STATUS_POLL_MS = 3000;
export const CANCEL_BATCH_LABEL = "Cancel";
export const CANCELLING_BATCH_LABEL = "Cancelling…";
export const CANCEL_BATCH_FAILED = "I couldn't stop that upload. Want to try again?";

export function batchReadProgressLabel(completed: number, total: number): string {
  return `${completed} of ${total} read`;
}

/** Said once when a sent zip starts being read; the count on screen isn't read on every check. */
export function batchReadingStartedMessage(total: number): string {
  return total === 1 ? "Reading 1 file" : `Reading ${total} files`;
}

export function batchCancelledMessage(name: string): string {
  return `Stopped. I won't read the rest of ${name}.`;
}

export function cancelBatchAccessibilityLabel(name: string): string {
  return `Cancel reading ${name}`;
}

/** The other names some Android pickers give a CSV or a zip, with the extension each stands for. */
export const DOCUMENT_MIME_TYPE_ALIASES: Readonly<Record<string, string>> = {
  "text/comma-separated-values": ".csv",
  "application/x-zip-compressed": ".zip",
};

export const UNKNOWN_MIME_TYPE = "application/octet-stream";

/**
 * What the Files picker offers: every type the server reads, plus the names some Android pickers give a CSV or a
 * zip, and octet-stream for a file they can't name. The extension is checked after picking, so a stray file is
 * turned away with a reason rather than sent.
 */
export const DOCUMENT_PICKER_TYPES: readonly string[] = [
  ...DOCUMENT_UPLOAD_MIME_TYPES,
  ...Object.keys(DOCUMENT_MIME_TYPE_ALIASES),
  UNKNOWN_MIME_TYPE,
];

export const CAPTURE_HINT = `Take a photo, or choose ${DOCUMENT_UPLOAD_KINDS_LABEL}. Up to ${MAX_FILES_AT_ONCE} at a time, ${DOCUMENT_UPLOAD_MAX_LABEL} each.`;

export function uploadFileStatusLabel(file: UploadFileProgress): string {
  switch (file.status) {
    case "queued":
      return "Waiting to send";
    case "uploading":
      if (file.percent === null) return "Sending…";
      if (file.percent >= UPLOAD_COMPLETE_PERCENT) return UPLOAD_PROCESSING_LABEL;
      return `Sending… ${file.percent}%`;
    case "reading":
      return "Reading…";
    case "done":
      return file.outcome ? UPLOAD_OUTCOME_MESSAGES[file.outcome] : "Sent";
    case "failed":
      return "Couldn't send";
    case "cancelled":
      return "Cancelled";
  }
}

export function uploadFileAccessibilityLabel(file: UploadFileProgress): string {
  return `${file.name}, ${uploadFileStatusLabel(file)}`;
}
