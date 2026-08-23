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

/** Max "Where to Eat" places allowed per manual. */
export const WELCOME_MANUAL_MAX_PLACES = 200;

/** Price tiers a place can be tagged with, in ascending order. */
export const WELCOME_MANUAL_PRICE_TIERS = ["$", "$$", "$$$"] as const;

/** Default name applied to a freshly-added place before the host renames it. */
export const NEW_PLACE_DEFAULT_NAME = "New place";

/** Max rooms allowed per manual. Mirrors WELCOME_MANUAL_MAX_ROOMS. */
export const WELCOME_MANUAL_MAX_ROOMS = 20;

/** Default name applied to a freshly-added room before the host renames it. */
export const NEW_ROOM_DEFAULT_NAME = "New room";

/**
 * Value used by the section scope <select> to mean "shared by every room".
 * A native select option value must be a string, so the null room_id needs
 * a sentinel; it is never sent to the API.
 */
export const SHARED_ROOM_OPTION = "shared";
