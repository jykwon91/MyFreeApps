/**
 * Longest values POST /applications/{id}/contacts accepts
 * (`ApplicationContactCreateRequest`: `_NAME_MAX_LEN`, `_LINKEDIN_MAX_LEN`, `_NOTES_MAX_LEN`).
 * `name` is String(200). The email column is String(320), but `EmailStr` refuses anything over 254.
 */
export const CONTACT_NAME_MAX_LENGTH = 200;
export const CONTACT_EMAIL_MAX_LENGTH = 254;
export const CONTACT_LINKEDIN_MAX_LENGTH = 2048;
export const CONTACT_NOTES_MAX_LENGTH = 5000;
