/**
 * Mirrors backend `app/services/storage/image_processor.py`: `MAX_IMAGE_BYTES` (10 MB, answered
 * 413 when over) and `ALLOWED_PHOTO_MIME_TYPES`. The server sniffs the real content, so a
 * declared type is only a hint for clients that can see one.
 */
export const LISTING_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const LISTING_PHOTO_MAX_MB = 10;
export const LISTING_PHOTO_MIME_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/heic"];
export const LISTING_PHOTO_HEIC_EXTENSION = /\.(heic|heif)$/i;
/** A photo upload is a multipart body the server re-encodes, so it gets longer than a normal call. */
export const LISTING_PHOTO_UPLOAD_TIMEOUT_MS = 120_000;
