import type { RentReminderChannel } from "@mybookkeeper/api-client/types/rent/rent-reminder-channel";
import type { RentReminderOverview } from "@mybookkeeper/api-client/types/rent/rent-reminder-overview";
import type { RentReminderPlan } from "@mybookkeeper/api-client/types/rent/rent-reminder-plan";
import type { RentReminderPreview } from "@mybookkeeper/api-client/types/rent/rent-reminder-preview";
import type { RentReminderSend } from "@mybookkeeper/api-client/types/rent/rent-reminder-send";
import { describeReminderError } from "@mybookkeeper/api-client/utils/rentReminderError";
import { formatDueDate, formatSendTime } from "@mybookkeeper/api-client/utils/rentReminderFormat";
import { formatCurrency } from "@platform/core/utils/currency";
import {
  addEmailFirst,
  addPhoneFirst,
  emailOnlyWent,
  goesOut,
  moneyDue,
  neitherWent,
  noEmailWontGo,
  noPhoneWontGo,
  oneFailed,
  REMINDER_MESSAGES,
  sentBoth,
  sentEmail,
  textOnlyWent,
} from "../../constants/rentReminders";

const CHANNEL_WORD: Record<RentReminderChannel, string> = { email: "email", sms: "text" };

export function firstNameOf(name: string | null | undefined): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}

export function planChannels(plan: RentReminderPlan): RentReminderChannel[] {
  return [...(plan.email_enabled ? (["email"] as const) : []), ...(plan.sms_enabled ? (["sms"] as const) : [])];
}

export function channelWords(channels: readonly RentReminderChannel[]): string {
  return channels.map((channel) => CHANNEL_WORD[channel]).join(" and ");
}

export function dueLine(preview: Pick<RentReminderPreview, "amount" | "due_date">): string {
  return moneyDue(formatCurrency(preview.amount), formatDueDate(preview.due_date));
}

/** Reads the date and time as the server wrote them: they're already in the plan's timezone. */
export function sendMoment(sendAt: string, now: Date = new Date()): string {
  if (Date.parse(sendAt) <= now.getTime()) return REMINDER_MESSAGES.sendingSoon;
  const [date, time] = sendAt.split("T");
  return goesOut(`${formatDueDate(date)} at ${formatSendTime(time)}`);
}

/**
 * The server sends every enabled channel together and refuses a second send
 * once any went out, so a channel with nobody to reach is lost for this due
 * date. That's only worth a warning while the other channel can still go.
 */
export function sendReadiness(overview: RentReminderOverview, plan: RentReminderPlan, firstName: string | null): { canSend: boolean; notes: string[] } {
  if (plan.sms_enabled && !overview.sms.available) return { canSend: false, notes: [REMINDER_MESSAGES.noSms] };
  const emailMissing = plan.email_enabled && !overview.tenant_has_email;
  const phoneMissing = plan.sms_enabled && !overview.tenant_has_phone;
  const emailReaches = plan.email_enabled && !emailMissing;
  const textReaches = plan.sms_enabled && !phoneMissing;
  if (!emailReaches && !textReaches) {
    return {
      canSend: false,
      notes: [...(emailMissing ? [addEmailFirst(firstName)] : []), ...(phoneMissing ? [addPhoneFirst(firstName)] : [])],
    };
  }
  return {
    canSend: true,
    notes: [...(emailMissing ? [noEmailWontGo(firstName)] : []), ...(phoneMissing ? [noPhoneWontGo(firstName)] : [])],
  };
}

export interface SendOutcome {
  message: string;
  /** Something didn't go out, so the note stays on screen. */
  isProblem: boolean;
}

export function sendOutcome(rows: readonly RentReminderSend[], name: string | null): SendOutcome {
  const email = rows.find((row) => row.channel === "email");
  const text = rows.find((row) => row.channel === "sms");
  const reason = (row: RentReminderSend) => describeReminderError(row.error_code);
  const failed = (row: RentReminderSend | undefined): row is RentReminderSend => row?.status === "failed";

  if (failed(email) && failed(text)) return { message: neitherWent(reason(text)), isProblem: true };
  if (email && failed(text)) return { message: emailOnlyWent(reason(text), name), isProblem: true };
  if (text && failed(email)) return { message: textOnlyWent(reason(email)), isProblem: true };
  if (failed(email)) return { message: oneFailed(CHANNEL_WORD.email, reason(email)), isProblem: true };
  if (failed(text)) return { message: oneFailed(CHANNEL_WORD.sms, reason(text)), isProblem: true };
  if (email && text) return { message: sentBoth(), isProblem: false };
  return { message: text ? REMINDER_MESSAGES.textWithPhone : sentEmail(name), isProblem: false };
}
