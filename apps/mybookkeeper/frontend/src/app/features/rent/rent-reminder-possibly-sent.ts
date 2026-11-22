import { RENT_REMINDER_CHANNEL_LABEL } from "@mybookkeeper/api-client/constants/rentReminderLabels";
import type { RentReminderChannel } from "@mybookkeeper/api-client/types/rent/rent-reminder-channel";
import type { RentReminderPreview } from "@mybookkeeper/api-client/types/rent/rent-reminder-preview";

/** Which reminder and which tries a "may already have reached them" confirmation was given for. */
export function possiblySentKey(preview: RentReminderPreview): string {
  const tries = preview.possibly_sent.map((p) => `${p.channel}:${p.attempt}`).join(",");
  return `${preview.due_date}|${tries}`;
}

/** Where to check whether a try that may have gone out did arrive. Only texts go through httpSMS. */
export function possiblySentAdvice(channels: readonly RentReminderChannel[]): string {
  const text = channels.includes("sms");
  const email = channels.includes("email");
  if (text && email) {
    return "Check the message log on httpsms.com for the text, and ask the tenant about the email, before sending them again.";
  }
  if (text) return "Check the message log on httpsms.com (or ask the tenant) before sending it again.";
  return `Ask the tenant whether the ${RENT_REMINDER_CHANNEL_LABEL.email.toLowerCase()} arrived before sending it again.`;
}
