import { DOCUMENT_UPLOAD_KINDS_LABEL, DOCUMENT_UPLOAD_MAX_LABEL, DOCUMENT_UPLOAD_MIME_TYPES } from "@mybookkeeper/api-client/constants/documentUpload";
import type { UploadFileProgress } from "../types/UploadFileProgress";

export const MAX_FILES_AT_ONCE = 10;
export const PHOTO_LONGEST_SIDE = 2000;
export const PHOTO_JPEG_QUALITY = 0.7;
export const SHUTTER_SIZE = 72;
export const UPLOAD_QUEUE_DIRECTORY = "upload-queue";
export const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;
/** Two in a row means the connection is down, so the rest aren't tried. One may just be a file too big for a slow link. */
export const NETWORK_FAILURES_BEFORE_STOP = 2;
export const SENT_MESSAGE_MS = 5000;
export const REQUEST_TOO_LARGE_STATUS = 413;
/** The statuses that mean this file is the problem. Others say nothing about it, so it's kept. */
export const FILE_REJECTED_STATUSES: readonly number[] = [REQUEST_TOO_LARGE_STATUS, 415, 422];
export const LIMIT_REACHED_STATUS = 429;
export const SERVER_ERROR_STATUS = 500;
export const UPLOAD_PROGRESS_BAR_HEIGHT = 4;
export const UPLOAD_COMPLETE_PERCENT = 100;
/** Every byte is out, and the server has yet to answer. */
export const UPLOAD_PROCESSING_LABEL = "Processing…";
export const UPLOAD_REFUSED_REASON = "The server wouldn't take it.";

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
    case "done":
      return "Sent";
    case "failed":
      return "Couldn't send";
  }
}

export function uploadFileAccessibilityLabel(file: UploadFileProgress): string {
  return `${file.name}, ${uploadFileStatusLabel(file)}`;
}
