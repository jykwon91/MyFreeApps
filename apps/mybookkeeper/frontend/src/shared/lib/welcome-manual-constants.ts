/** Page size for the welcome-manuals list query. Mirrors the listings page. */
export const WELCOME_MANUAL_PAGE_SIZE = 25;

/** Default title applied to a freshly-added section before the host renames it. */
export const NEW_SECTION_DEFAULT_TITLE = "New section";

/** Max label/value fields allowed per section. */
export const MAX_FIELDS_PER_SECTION = 20;

/** Default label applied to a freshly-added field before the host renames it. */
export const NEW_FIELD_DEFAULT_LABEL = "New field";

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

/**
 * Detail-page view modes. On desktop the editor and guest preview show side by
 * side; on mobile this toggles which one is visible.
 */
export const WELCOME_MANUAL_VIEW_MODE = {
  EDIT: "edit",
  PREVIEW: "preview",
} as const;

export type WelcomeManualViewMode =
  (typeof WELCOME_MANUAL_VIEW_MODE)[keyof typeof WELCOME_MANUAL_VIEW_MODE];
