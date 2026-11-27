import type { RentReminderOverview } from "../types/rent/rent-reminder-overview";
import type { RentReminderSmsStatus } from "../types/rent/rent-reminder-sms-status";

/**
 * The text switch shows when the plan's owner may send texts, and while a saved plan still has
 * texts on when they may not, so texts can be turned off. The server decides who may text.
 */
export function showsTextSwitch(overview: Pick<RentReminderOverview, "plan" | "sms">): boolean {
  return overview.sms.allowed || overview.plan?.sms_enabled === true;
}

/** Whether the text switch can't be moved: the server can't send texts, or, for an owner who may
 *  not send them, texts are already off (the switch only ever turns them off). */
export function isTextSwitchLocked(sms: RentReminderSmsStatus, smsEnabled: boolean): boolean {
  return !sms.available || (!sms.allowed && !smsEnabled);
}
