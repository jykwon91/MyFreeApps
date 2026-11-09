// Bounds mirror backend/app/core/welcome_manual_constants.py and the request schemas built from it.
export const WELCOME_MANUAL_TITLE_MAX_LENGTH = 200;
export const WELCOME_MANUAL_SECTION_TITLE_MAX_LENGTH = 200;
export const WELCOME_MANUAL_IMAGE_CAPTION_MAX_LENGTH = 500;
export const WELCOME_MANUAL_RECIPIENT_NAME_MAX_LENGTH = 200;
export const WELCOME_MANUAL_FIELD_LABEL_MAX_LENGTH = 100;
export const WELCOME_MANUAL_FIELD_VALUE_MAX_LENGTH = 500;
export const WELCOME_MANUAL_ROOM_NAME_MAX_LENGTH = 120;
export const WELCOME_MANUAL_PLACE_NAME_MAX_LENGTH = 150;
export const WELCOME_MANUAL_PLACE_CUISINE_MAX_LENGTH = 50;
export const WELCOME_MANUAL_PLACE_NOTE_MAX_LENGTH = 500;
export const WELCOME_MANUAL_PLACE_MAP_URL_MAX_LENGTH = 2048;

/** Manuals fetched per page of the list. */
export const WELCOME_MANUAL_PAGE_SIZE = 25;

/** Most sections one manual can hold. */
export const WELCOME_MANUAL_MAX_SECTIONS = 50;

/** Max label/value fields allowed per section. */
export const MAX_FIELDS_PER_SECTION = 20;

/** Max photos allowed per section. Enforced by the server on upload and on reorder. */
export const WELCOME_MANUAL_MAX_SECTION_IMAGES = 20;

/** Max rooms allowed per manual. */
export const WELCOME_MANUAL_MAX_ROOMS = 20;

/** Max "Where to Eat" places allowed per manual. */
export const WELCOME_MANUAL_MAX_PLACES = 200;

/** Price tiers a place can be tagged with, in ascending order. */
export const WELCOME_MANUAL_PRICE_TIERS = ["$", "$$", "$$$"] as const;

/** Max upload size per section image, in bytes (10MB). Mirrors listing photos. */
export const SECTION_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** Allowed image MIME types for section uploads. HEIC is also matched by extension. */
export const SECTION_IMAGE_ALLOWED_MIME: readonly string[] = ["image/jpeg", "image/png", "image/heic"];

/**
 * What the phone's file picker offers. The server accepts a HEIC upload's header but cannot decode
 * it, so a HEIC file is never offered; photos from the library are converted to JPEG first.
 */
export const SECTION_IMAGE_PICKER_MIME: readonly string[] = ["image/jpeg", "image/png"];

/** Where a guest opens a shared manual, relative to the site root. */
export const WELCOME_MANUAL_GUIDE_PATH = "/guide";

/** RFC-lite email format check for the email-to-guest submit gate. */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Stands for "shared by every room" wherever a choice of room is a string, such as a select or a
 * picker. A section's real room_id is null in that case, so this is never sent to the API.
 */
export const SHARED_ROOM_OPTION = "shared";

/**
 * Said when a reorder is refused with 409 because the list changed somewhere else. The server's own
 * detail ("must be a permutation of ...") is for developers and is never shown.
 */
export const WELCOME_MANUAL_STALE_ORDER_MESSAGE = "That list changed somewhere else. I've refreshed it, so check the order and try again.";
