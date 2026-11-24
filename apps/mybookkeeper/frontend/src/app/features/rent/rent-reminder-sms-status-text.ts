import { SMS_FROM_NUMBER_FALLBACK, SMS_NOT_ALLOWED_NOTE } from "@mybookkeeper/api-client/constants/rentReminderLabels";
import type { RentReminderSmsStatus } from "@mybookkeeper/api-client/types/rent/rent-reminder-sms-status";

/** The line under the text switch: why texts can't go, or which number they come from. */
export function smsStatusText(sms: RentReminderSmsStatus): string {
  if (!sms.available) return "Not set up on this server yet — texts need a Twilio number.";
  if (!sms.allowed) return SMS_NOT_ALLOWED_NOTE;
  return `From ${sms.from_number ?? SMS_FROM_NUMBER_FALLBACK}.`;
}
