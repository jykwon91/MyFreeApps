import { TEXT_HANDOFF_HOLDER } from "@mybookkeeper/api-client/constants/rentReminderLabels";
import type { RentReminderSend } from "@mybookkeeper/api-client/types/rent/rent-reminder-send";
import type { RentReminderSendOutcome } from "@mybookkeeper/api-client/types/rent/rent-reminder-send-outcome";
import { isTextHandedOff } from "@mybookkeeper/api-client/utils/isTextHandedOff";
import { reminderMayStillArrive } from "@mybookkeeper/api-client/utils/reminderMayStillArrive";
import {
  rentReminderChannelWord,
  rentReminderChannelWords,
} from "@mybookkeeper/api-client/utils/rentReminderChannelWords";
import { possiblySentAdvice } from "@mybookkeeper/api-client/utils/rentReminderPossiblySent";
import { TENANT_WORDS } from "./rent-reminder-possibly-sent";

/** A try that didn't fail, as the error toast names it after the failures. A
 *  text the phone hasn't reported on yet is with the phone, not gone out. */
function notFailedLine(row: RentReminderSend): string {
  if (isTextHandedOff(row)) return `The text is with ${TEXT_HANDOFF_HOLDER}.`;
  return `The ${rentReminderChannelWord(row.channel)} went out.`;
}

/** What didn't go out, what may have, then where the rest are, so the operator
 *  doesn't take a channel it leaves out as failed too. */
function problemMessage(results: readonly RentReminderSend[], failed: readonly RentReminderSend[]): string {
  const notSent = failed.filter((r) => !reminderMayStillArrive(r.error_code)).map((r) => r.channel);
  const unsure = failed.filter((r) => reminderMayStillArrive(r.error_code)).map((r) => r.channel);
  const lines: string[] = [];
  if (notSent.length > 0) lines.push(`The ${rentReminderChannelWords(notSent)} didn't go out.`);
  if (unsure.length > 0) {
    lines.push(
      `The ${rentReminderChannelWords(unsure)} may already have been sent. ${possiblySentAdvice(unsure, TENANT_WORDS)}`,
    );
  }
  lines.push(...results.filter((r) => r.status !== "failed").map(notFailedLine), "See history below.");
  return lines.join(" ");
}

function successMessage(results: readonly RentReminderSend[]): string {
  const wentOut = results.filter((r) => !isTextHandedOff(r)).map((r) => r.channel);
  const lines: string[] = [];
  if (wentOut.length > 0) lines.push(`Reminder sent by ${rentReminderChannelWords(wentOut)}.`);
  if (results.some((r) => isTextHandedOff(r))) {
    lines.push(`The text is with ${TEXT_HANDOFF_HOLDER}, and the history below will show whether it went out.`);
  }
  return lines.join(" ");
}

/** The toast after Send now. When any channel failed it is a problem, and it
 *  accounts for every channel, not only the ones that failed. */
export function sendNowToast(results: readonly RentReminderSend[]): RentReminderSendOutcome {
  const failed = results.filter((r) => r.status === "failed");
  if (failed.length > 0) return { message: problemMessage(results, failed), isProblem: true };
  return { message: successMessage(results), isProblem: false };
}
