const ERROR_LABEL = new Map<string, string>(Object.entries({
  no_phone_confirmation:
    "The phone never confirmed it, so it may still arrive. Check it's on, online, and httpSMS isn't battery-optimized",
  send_interrupted: "Sending was interrupted, so it may still arrive",
  no_recipient: "No contact details on file",
  invalid_phone: "The phone number couldn't be read",
  sms_not_configured: "Texts aren't set up on the server",
  expired: "The phone didn't send it in time",
  email_not_configured: "Email isn't set up on the server",
  email_send_failed: "The mail server refused it",
}));

const PHONE_FAILED_PREFIX = "phone_failed: ";
const RELAY_PREFIX = "sms_";
const PHONE_FAILED = "The phone reported a problem sending it. Check the httpSMS app";
const RELAY_REFUSED = "The text relay refused it";
const UNKNOWN_FAILURE = "Something went wrong sending it";

/** Plain-language reason for a failed send, without a final period so it can sit inside a sentence. */
export function describeReminderError(code: string | null): string {
  if (!code) return UNKNOWN_FAILURE;
  const known = ERROR_LABEL.get(code);
  if (known) return known;
  if (code.startsWith(PHONE_FAILED_PREFIX)) return PHONE_FAILED;
  if (code.startsWith(RELAY_PREFIX)) return RELAY_REFUSED;
  return UNKNOWN_FAILURE;
}
