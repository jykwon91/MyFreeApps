import type { RentReminderChannel } from "../types/rent/rent-reminder-channel";
import type { RentReminderPlan } from "../types/rent/rent-reminder-plan";

/** The channels a plan reminds the tenant on, email first. Send now sends them all together. */
export function rentReminderPlanChannels(
  plan: Pick<RentReminderPlan, "email_enabled" | "sms_enabled">,
): RentReminderChannel[] {
  const channels: RentReminderChannel[] = [];
  if (plan.email_enabled) channels.push("email");
  if (plan.sms_enabled) channels.push("sms");
  return channels;
}
