/** Page size for the welcome-manuals list query. Mirrors the listings page. */
export const WELCOME_MANUAL_PAGE_SIZE = 25;

/** Default title applied to a freshly-added section before the host renames it. */
export const NEW_SECTION_DEFAULT_TITLE = "New section";

/** Max upload size per section image, in bytes (10MB). Mirrors listing photos. */
export const SECTION_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** Allowed image MIME types for section uploads. HEIC also matched by extension. */
export const SECTION_IMAGE_ALLOWED_MIME: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/heic",
];

/** Observability domain tag for missing section-image objects. */
export const SECTION_IMAGE_STORAGE_DOMAIN = "welcome_manual_section_image";

/** RFC-lite email format check for the email-to-guest dialog's submit gate. */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
