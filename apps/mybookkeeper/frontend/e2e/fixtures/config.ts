export const BACKEND_URL = process.env.E2E_BACKEND_URL ?? "http://localhost:8000";
export const E2E_EMAIL = process.env.E2E_EMAIL ?? "e2e-test@example.com";
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "E2eTestP@ssw0rd!Secure";

/**
 * Rendered-width bounds for the shared form-dialog shell, in CSS pixels.
 *
 * Deliberately loose: the point is that a wide dialog is materially wider than
 * a narrow one, not that either matches a Tailwind scale value exactly.
 */
export const FORM_DIALOG_MIN_WIDE_PX = 700;
export const FORM_DIALOG_MAX_NARROW_PX = 600;
