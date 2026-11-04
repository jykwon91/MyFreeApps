import type { RentReminderPlan } from "./rent-reminder-plan";
import type { RentReminderSmsStatus } from "./rent-reminder-sms-status";

/** Everything the Rent reminders card needs on first load. */
export interface RentReminderOverview {
  plan: RentReminderPlan | null;
  sms: RentReminderSmsStatus;
  tenant_has_email: boolean;
  tenant_has_phone: boolean;
}
