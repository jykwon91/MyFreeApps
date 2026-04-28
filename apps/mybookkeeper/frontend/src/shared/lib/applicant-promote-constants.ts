/**
 * Constants for the inquiry → applicant promotion flow (PR 3.2).
 *
 * Mirrors the backend constants in ``app/core/applicant_constants.py``.
 * Keep them in sync — divergence between the two would let the UI accept
 * input the API rejects (or vice versa).
 */

/** Minimum applicant age in years — matches APPLICANT_MINIMUM_AGE_YEARS. */
export const APPLICANT_MINIMUM_AGE_YEARS = 18;

/** Field-length caps — match the backend column ``String(N)`` lengths. */
export const APPLICANT_LEGAL_NAME_MAX = 255;
export const APPLICANT_EMPLOYER_MAX = 255;
export const APPLICANT_VEHICLE_MAX = 255;
export const APPLICANT_PETS_MAX = 1000;
export const APPLICANT_REFERRED_BY_MAX = 255;

/**
 * Toast copy. Conversational AI-tone per CLAUDE.md UX guidelines —
 * first-person, casual, no system-log phrasing.
 */
export const PROMOTE_TOAST_MESSAGES = {
  success: "Promoted to applicant.",
  alreadyPromoted: "I already promoted this inquiry. Want to view that applicant?",
  notPromotable: "I can't promote this one — it's already declined or archived.",
  genericError: "I wasn't able to promote that. Want to try again?",
} as const;

/**
 * Tooltip shown next to fields the inquiry didn't supply. Conversational
 * tone matches the rest of the AI-facing UI.
 */
export const MISSING_FIELD_TOOLTIP =
  "I couldn't find this in the inquiry — fill it in if you have it.";
