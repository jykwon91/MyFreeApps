import { TWILIO_ERROR_LABEL } from "../constants/twilioErrorLabels";

/**
 * Every fixed code in ``REMINDER_ERROR_CODES`` (app/core/rent_reminder_constants.py) has a line here.
 * Texts sent before the move to Twilio keep these codes, so what happened never names a provider;
 * only where to check does.
 */
const ERROR_LABEL = new Map<string, string>(Object.entries({
  no_sms_confirmation:
    "The text service never reported back, so it may still arrive. Check the Twilio console's messaging logs, or ask the tenant, before sending again",
  send_interrupted: "Sending was interrupted, so it may still arrive. Check with the tenant before sending again",
  no_recipient: "No contact details on file",
  invalid_phone: "The tenant's phone number isn't valid. Fix it on their record",
  sms_not_configured: "Texts aren't set up on the server",
  email_not_configured: "Email isn't set up on the server",
  email_send_failed: "The mail server didn't take it",
  email_outcome_unknown:
    "The mail server never confirmed it, so it may already have been sent. Ask the tenant whether it arrived before sending again",
  sms_network_error: "The server couldn't reach the text service, so it wasn't sent",
  sms_outcome_unknown:
    "The text service never confirmed it, so it may already have been sent. Check the Twilio console's messaging logs, or ask the tenant, before sending again",
  unexpected_error: "Something went wrong sending it",
}));

/** The text couldn't be delivered: ``sms_failed: <Twilio error number>``, or from before Twilio,
 *  ``sms_failed: <the phone's own words>`` and ``sms_failed: expired``. */
const SMS_FAILED_PREFIX = "sms_failed: ";
/** The text was refused when it was sent: ``sms_<Twilio error number>``, or from before Twilio, ``sms_http_<status>``. */
const SMS_REFUSED_PREFIX = "sms_";
const SMS_EXPIRED_DETAIL = "expired";
const SMS_FAILED = "The text couldn't be delivered";
const SMS_EXPIRED = "The text expired before it went out";
const SMS_REFUSED = "The text service refused it";
const UNKNOWN_FAILURE = "Something went wrong sending it";
/** Twilio's error numbers are five digits; anything else after a prefix came from somewhere else. */
const TWILIO_ERROR_NUMBER = /^[0-9]{5}$/;
const TWILIO_ERROR_DOCS = "twilio.com/docs/api/errors/";

/** ``fallback``, or what the Twilio error number in ``detail`` means, always with the number. */
function prefixedReason(detail: string, fallback: string): string {
  if (!TWILIO_ERROR_NUMBER.test(detail)) return fallback;
  const label = TWILIO_ERROR_LABEL.get(detail);
  if (label) return `${label} (Twilio error ${detail})`;
  return `${fallback} (Twilio error ${detail}, see ${TWILIO_ERROR_DOCS}${detail})`;
}

/** Plain-language reason for a failed send, without a final period so it can sit inside a sentence. */
export function describeReminderError(code: string | null): string {
  if (!code) return UNKNOWN_FAILURE;
  const known = ERROR_LABEL.get(code);
  if (known) return known;
  if (code.startsWith(SMS_FAILED_PREFIX)) {
    const detail = code.slice(SMS_FAILED_PREFIX.length);
    if (detail === SMS_EXPIRED_DETAIL) return SMS_EXPIRED;
    return prefixedReason(detail, SMS_FAILED);
  }
  if (code.startsWith(SMS_REFUSED_PREFIX)) return prefixedReason(code.slice(SMS_REFUSED_PREFIX.length), SMS_REFUSED);
  return UNKNOWN_FAILURE;
}
