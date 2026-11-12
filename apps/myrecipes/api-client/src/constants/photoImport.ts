/**
 * Photo import (POST /recipes/extract), shared by the website and the phone. The limits mirror
 * the backend: `settings.max_photo_upload_bytes` and `photo_extraction_service.SUPPORTED_MEDIA_TYPES`.
 */
export const PHOTO_IMPORT_MAX_BYTES = 15 * 1024 * 1024;
export const PHOTO_IMPORT_MAX_MEGABYTES = PHOTO_IMPORT_MAX_BYTES / (1024 * 1024);
export const PHOTO_IMPORT_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * The backend shrinks every photo to this long edge, as JPEG at this quality, before Claude reads
 * it (`_MAX_EDGE_PX`, `_JPEG_QUALITY`). A phone can do the same before sending, which uploads far
 * less and reads exactly the same.
 */
export const PHOTO_IMPORT_LONGEST_SIDE = 1568;
export const PHOTO_IMPORT_JPEG_QUALITY = 0.9;

/** Reading a photo is one request of up to ~30s. The hint waits, so a quick one doesn't worry anyone. */
export const PHOTO_IMPORT_TIME_HINT_DELAY_MS = 5000;

export const PHOTO_IMPORT_COPY = {
  title: "Import from photo",
  reading: "Reading your recipe photo...",
  timeHint: "This usually takes up to 30 seconds.",
} as const;
