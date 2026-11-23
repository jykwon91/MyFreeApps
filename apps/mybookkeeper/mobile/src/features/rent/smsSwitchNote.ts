import type { RentReminderOverview } from "@mybookkeeper/api-client/types/rent/rent-reminder-overview";
import { REMINDER_SETUP_MESSAGES, smsFrom } from "../../constants/rentReminderSetup";

/** The note under the text switch: why texts can't be on, or where they come from and whether the tenant can get them. */
export function smsSwitchNote(overview: Pick<RentReminderOverview, "sms" | "tenant_has_phone">): string {
  if (!overview.sms.available) return REMINDER_SETUP_MESSAGES.smsUnavailable;
  const from = smsFrom(overview.sms.from_number);
  if (overview.tenant_has_phone) return from;
  return `${from} ${REMINDER_SETUP_MESSAGES.noPhone}`;
}
