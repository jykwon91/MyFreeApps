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

export const RENT_REMINDER_STATUS_LABEL: Record<RentReminderSendStatus, string> = {
  queued: "Sending",
  sent_to_phone: "Sent to phone",
  sent: "Sent",
  delivered: "Delivered",
  failed: "Failed",
};
