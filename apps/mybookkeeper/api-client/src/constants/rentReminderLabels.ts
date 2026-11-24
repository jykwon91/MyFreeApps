import type { RentReminderChannel } from "../types/rent/rent-reminder-channel";
import type { RentReminderSendStatus } from "../types/rent/rent-reminder-send-status";

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

export const RENT_REMINDER_CHANNEL_LABEL: Record<RentReminderChannel, string> = {
  email: "Email",
  sms: "Text",
};

/** Who has a text that's been handed off but hasn't been reported on yet
 *  (see `isTextHandedOff`). Each app writes its own sentence around it. */
export const TEXT_HANDOFF_HOLDER = "Twilio";

/** What texts are said to come from when the server doesn't say which number. */
export const SMS_FROM_NUMBER_FALLBACK = "your Twilio number";

export const RENT_REMINDER_STATUS_LABEL: Record<RentReminderSendStatus, string> = {
  queued: "Sending",
  sent_to_provider: "With Twilio",
  sent: "Sent",
  delivered: "Delivered",
  failed: "Failed",
};
