import type { RentReminderOverview } from "@mybookkeeper/api-client/types/rent/rent-reminder-overview";
import type { RentReminderPlan } from "@mybookkeeper/api-client/types/rent/rent-reminder-plan";
import type { RentReminderPreview } from "@mybookkeeper/api-client/types/rent/rent-reminder-preview";
import type { RentReminderSend } from "@mybookkeeper/api-client/types/rent/rent-reminder-send";
import type { RentReminderSendOutcome } from "@mybookkeeper/api-client/types/rent/rent-reminder-send-outcome";
import { isTextHandedOff } from "@mybookkeeper/api-client/utils/isTextHandedOff";
import { describeReminderError } from "@mybookkeeper/api-client/utils/rentReminderError";
import { reminderMayStillArrive } from "@mybookkeeper/api-client/utils/reminderMayStillArrive";
import { rentReminderChannelWord } from "@mybookkeeper/api-client/utils/rentReminderChannelWords";
import { formatDueDate, formatSendTime } from "@mybookkeeper/api-client/utils/rentReminderFormat";
import { zoneAbbreviation } from "@mybookkeeper/api-client/utils/rentReminderZone";
import { formatCurrency } from "@platform/core/utils/currency";
import {
  addEmailFirst,
  addPhoneFirst,
  channelDidntGo,
  channelMayHaveGone,
  channelWent,
  emailOnlyWent,
  goesOut,
  moneyDue,
  neitherWent,
  neitherWentEach,
  noEmailWontGo,
  noPhoneWontGo,
  oneFailed,
  onlyEmailFailed,
  REMINDER_MESSAGES,
  sentBoth,
  sentEmail,
} from "../../constants/rentReminders";

export function firstNameOf(name: string | null | undefined): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}

export function dueLine(preview: Pick<RentReminderPreview, "amount" | "due_date">): string {
  return moneyDue(formatCurrency(preview.amount), formatDueDate(preview.due_date));
}

/** Reads the date and time as the server wrote them: they're already in the plan's timezone. */
export function sendMoment(sendAt: string, timeZone: string, now: Date = new Date()): string {
  if (Date.parse(sendAt) <= now.getTime()) return REMINDER_MESSAGES.sendingSoon;
  const [date, time] = sendAt.split("T");
  return goesOut(`${formatDueDate(date)} at ${formatSendTime(time)} ${zoneAbbreviation(timeZone, new Date(sendAt))}`);
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

/** A send that didn't fail: a text Twilio hasn't reported on yet is still
 *  with Twilio, so only the rest are said to have gone out. */
function wentOrHandedOff(row: RentReminderSend): string {
  if (isTextHandedOff(row)) return REMINDER_MESSAGES.textHandedOff;
  return channelWent(rentReminderChannelWord(row.channel));
}

/** Each channel in its own words, once one may have gone out without our knowing. */
function unsureOutcome(rows: readonly RentReminderSend[]): RentReminderSendOutcome {
  const lines = rows.map((row) => {
    if (row.status !== "failed") return wentOrHandedOff(row);
    const channel = rentReminderChannelWord(row.channel);
    const reason = describeReminderError(row.error_code);
    return reminderMayStillArrive(row.error_code) ? channelMayHaveGone(channel, reason) : channelDidntGo(channel, reason);
  });
  return { message: lines.join(" "), isProblem: true };
}

export function sendOutcome(rows: readonly RentReminderSend[], name: string | null): RentReminderSendOutcome {
  const email = rows.find((row) => row.channel === "email");
  const text = rows.find((row) => row.channel === "sms");
  const reason = (row: RentReminderSend) => describeReminderError(row.error_code);
  const failed = (row: RentReminderSend | undefined): row is RentReminderSend => row?.status === "failed";

  if (rows.some((row) => row.status === "failed" && reminderMayStillArrive(row.error_code))) return unsureOutcome(rows);

  if (failed(email) && failed(text)) {
    // Compare the words, not the codes: different codes can read the same.
    if (reason(email) === reason(text)) return { message: neitherWent(reason(email)), isProblem: true };
    return { message: neitherWentEach(reason(email), reason(text)), isProblem: true };
  }
  if (email && failed(text)) return { message: emailOnlyWent(reason(text), name), isProblem: true };
  if (text && failed(email)) return { message: onlyEmailFailed(reason(email), wentOrHandedOff(text)), isProblem: true };
  if (failed(email)) return { message: oneFailed(rentReminderChannelWord("email"), reason(email)), isProblem: true };
  if (failed(text)) return { message: oneFailed(rentReminderChannelWord("sms"), reason(text)), isProblem: true };
  if (email && text) return { message: sentBoth(wentOrHandedOff(text)), isProblem: false };
  if (text) return { message: wentOrHandedOff(text), isProblem: false };
  return { message: sentEmail(name), isProblem: false };
}
