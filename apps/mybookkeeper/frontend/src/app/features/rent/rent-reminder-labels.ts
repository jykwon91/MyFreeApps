import type { BadgeTone } from "@platform/ui";
import type { RentReminderChannel } from "@/shared/types/rent/rent-reminder-channel";
import type { RentReminderFrequency } from "@/shared/types/rent/rent-reminder-frequency";
import type { RentReminderSendStatus } from "@/shared/types/rent/rent-reminder-send-status";

/** 0 = Monday … 6 = Sunday, matching Python's ``date.weekday()``. */
export const WEEKDAY_NAMES: readonly string[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const SUNDAY = 6;

/** Mirrors ``DEFAULT_SEND_DAYS_BEFORE`` in ``rent_reminder_constants.py``: a day
 *  ahead for a weekly payer, three for a monthly one. */
export const DEFAULT_SEND_DAYS_BEFORE: Record<RentReminderFrequency, number> = {
  weekly: 1,
  monthly: 3,
};

/** Upper bounds the backend enforces (a weekly reminder sent 7+ days ahead
 *  would land before the previous week's due date). */
export const MAX_SEND_DAYS_BEFORE: Record<RentReminderFrequency, number> = {
  weekly: 6,
  monthly: 14,
};

export const DEFAULT_SEND_TIME = "18:00";
export const DEFAULT_TIMEZONE = "America/Chicago";
/** Reminders only go out between 9am and 8pm local time. */
export const SEND_TIME_MIN = "09:00";
export const SEND_TIME_MAX = "19:59";

export const RENT_REMINDER_CHANNEL_LABEL: Record<RentReminderChannel, string> = {
  email: "Email",
  sms: "Text",
};

export const RENT_REMINDER_STATUS_LABEL: Record<RentReminderSendStatus, string> = {
  queued: "Sending",
  sent_to_phone: "Sent to phone",
  sent: "Sent",
  delivered: "Delivered",
  failed: "Failed",
};

/** `sent_to_phone` is `info`, not `success`: the phone has it, but has not yet
 *  confirmed it went out. Only a confirmed send is green. */
export const RENT_REMINDER_STATUS_TONE: Record<RentReminderSendStatus, BadgeTone> = {
  queued: "neutral",
  sent_to_phone: "info",
  sent: "success",
  delivered: "success",
  failed: "danger",
};

const ERROR_LABEL: Record<string, string> = {
  no_phone_confirmation:
    "The phone never confirmed it — check it's on, online, and httpSMS isn't battery-optimized",
  send_interrupted: "Sending was interrupted",
  no_recipient: "No contact details on file",
  invalid_phone: "The phone number couldn't be read",
  sms_not_configured: "Texts aren't set up on the server",
  expired: "The phone didn't send it in time",
  email_not_configured: "Email isn't set up on the server",
  email_send_failed: "The mail server refused it",
};

const PHONE_FAILED_PREFIX = "phone_failed: ";
const RELAY_PREFIX = "sms_";

/** Plain-language reason for a failed send. */
export function describeReminderError(code: string | null): string | null {
  if (!code) return null;
  if (code in ERROR_LABEL) return ERROR_LABEL[code];
  if (code.startsWith(PHONE_FAILED_PREFIX)) {
    return `The phone reported: ${code.slice(PHONE_FAILED_PREFIX.length)}`;
  }
  if (code.startsWith(RELAY_PREFIX)) {
    return `The text relay refused it (${code.slice(RELAY_PREFIX.length)})`;
  }
  return code;
}
