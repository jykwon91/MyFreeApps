/**
 * Mirrors ``MAY_STILL_ARRIVE_ERRORS`` in ``app/core/rent_reminder_constants.py``:
 * a failed send that may still have reached the tenant, so sending again asks
 * the operator to check and confirm first.
 */
export const MAY_STILL_ARRIVE_ERROR_CODES: readonly string[] = [
  "no_sms_confirmation",
  "send_interrupted",
  "sms_outcome_unknown",
  "email_outcome_unknown",
];

/** Mirrors ``REMINDER_MAY_HAVE_BEEN_SENT_CODE``: Send now's 409 when resending wasn't confirmed. */
export const REMINDER_MAY_HAVE_BEEN_SENT_CODE = "REMINDER_MAY_HAVE_BEEN_SENT";
