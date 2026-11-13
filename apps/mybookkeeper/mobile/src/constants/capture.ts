import { DOCUMENT_UPLOAD_KINDS_LABEL, DOCUMENT_UPLOAD_MAX_LABEL, DOCUMENT_UPLOAD_MIME_TYPES } from "@mybookkeeper/api-client/constants/documentUpload";
import type { UploadFileProgress } from "../types/UploadFileProgress";

export const MAX_FILES_AT_ONCE = 10;
export const PHOTO_LONGEST_SIDE = 2000;
export const PHOTO_JPEG_QUALITY = 0.7;
export const SHUTTER_SIZE = 72;
export const UPLOAD_QUEUE_DIRECTORY = "upload-queue";
export const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;
export const SENT_MESSAGE_MS = 5000;
/** The statuses that mean this file is the problem. Others say nothing about it, so it's kept. */
export const FILE_REJECTED_STATUSES: readonly number[] = [413, 415, 422];
export const LIMIT_REACHED_STATUS = 429;
export const SERVER_ERROR_STATUS = 500;
export const UPLOAD_PROGRESS_BAR_HEIGHT = 4;

/**
 * What the Files picker offers: every type the server reads, plus the names some Android pickers give a CSV or a
 * zip, and octet-stream for a file they can't name. The extension is checked after picking, so a stray file is
 * turned away with a reason rather than sent.
 */
export const DOCUMENT_PICKER_TYPES: readonly string[] = [
  ...DOCUMENT_UPLOAD_MIME_TYPES,
  "text/comma-separated-values",
  "application/x-zip-compressed",
  "application/octet-stream",
];

export const CAPTURE_HINT = `Take a photo, or choose ${DOCUMENT_UPLOAD_KINDS_LABEL}. Up to ${MAX_FILES_AT_ONCE} at a time, ${DOCUMENT_UPLOAD_MAX_LABEL} each.`;

export function uploadFileStatusLabel(file: UploadFileProgress): string {
  switch (file.status) {
    case "queued":
      return "Waiting to send";
    case "uploading":
      return file.percent === null ? "Sending…" : `Sending… ${file.percent}%`;
    case "done":
      return "Sent";
    case "failed":
      return "Couldn't send";
  }
}

export function uploadFileAccessibilityLabel(file: UploadFileProgress): string {
  return `${file.name}, ${uploadFileStatusLabel(file)}`;
}
