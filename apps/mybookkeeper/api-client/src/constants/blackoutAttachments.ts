import { MIB } from "./byteUnits";

/** Client-side pre-check for a booking attachment — matches the backend cap, ``max_blackout_attachment_size_bytes``. */
export const BLACKOUT_ATTACHMENT_MAX_BYTES = 25 * MIB;

export const BLACKOUT_ATTACHMENT_MAX_LABEL = `${BLACKOUT_ATTACHMENT_MAX_BYTES / MIB} MB`;

export const BLACKOUT_ATTACHMENT_MIME_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
];

/** A photo over a phone connection can take longer than the default request timeout. */
export const BLACKOUT_ATTACHMENT_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;
