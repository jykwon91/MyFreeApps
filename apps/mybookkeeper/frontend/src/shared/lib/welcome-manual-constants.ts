/** Default title applied to a freshly-added section before the host renames it. */
export const NEW_SECTION_DEFAULT_TITLE = "New section";

/** Default label applied to a freshly-added field before the host renames it. */
export const NEW_FIELD_DEFAULT_LABEL = "New field";

/** Observability domain tag for missing section-image objects. */
export const SECTION_IMAGE_STORAGE_DOMAIN = "welcome_manual_section_image";

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

/** Default name applied to a freshly-added place before the host renames it. */
export const NEW_PLACE_DEFAULT_NAME = "New place";

/** Default name applied to a freshly-added room before the host renames it. */
export const NEW_ROOM_DEFAULT_NAME = "New room";
