/**
 * Every rent-reminder text ends with this; emails don't. Mirrors
 * `SMS_OPT_OUT_SUFFIX` in the backend's `rent_reminder_constants.py`
 * (compared by `test_rent_reminder_codes_match_api_client.py`).
 */
export const RENT_REMINDER_SMS_OPT_OUT_SUFFIX = ". Reply STOP to opt out.";

/** Shown under the preview when texts are on, so it matches what the tenant reads. */
export const RENT_REMINDER_SMS_OPT_OUT_NOTE = `Texts also end with "${RENT_REMINDER_SMS_OPT_OUT_SUFFIX.slice(2)}"`;
