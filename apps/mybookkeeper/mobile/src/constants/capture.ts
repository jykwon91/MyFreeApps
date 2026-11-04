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
