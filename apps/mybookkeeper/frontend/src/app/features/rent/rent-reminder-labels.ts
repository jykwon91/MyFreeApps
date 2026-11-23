import type { BadgeTone } from "@platform/ui";
import type { RentReminderSendStatus } from "@mybookkeeper/api-client/types/rent/rent-reminder-send-status";

/** `sent_to_provider` is `info`, not `success`: Twilio has it, but has not yet
 *  confirmed it went out. Only a confirmed send is green. */
export const RENT_REMINDER_STATUS_TONE: Record<RentReminderSendStatus, BadgeTone> = {
  queued: "neutral",
  sent_to_provider: "info",
  sent: "success",
  delivered: "success",
  failed: "danger",
};
