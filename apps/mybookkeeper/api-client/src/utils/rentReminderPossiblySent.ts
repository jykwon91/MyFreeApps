import type { RentReminderChannel } from "../types/rent/rent-reminder-channel";
import { rentReminderChannelWords } from "./rentReminderChannelWords";

/**
 * Where to check whether tries that may have gone out arrived. Only texts can be
 * looked up in Twilio, so an email is checked with the tenant. `channels` has at
 * least one channel: with none there's nothing to warn about, and no caller
 * shows a warning then. `who` is how the app names the tenant: "the tenant",
 * their first name, or "them".
 */
export function possiblySentAdvice(channels: readonly RentReminderChannel[], who: string): string {
  const text = channels.includes("sms");
  const email = channels.includes("email");
  if (text && email) {
    return `Check the Twilio console's messaging logs for the text, and ask ${who} about the email, before sending them again.`;
  }
  if (text) return `Check the Twilio console's messaging logs (or ask ${who}) before sending it again.`;
  return `Ask ${who} whether the email arrived before sending it again.`;
}

/** The warning on a reminder whose last try may already have reached the tenant. */
export function possiblySentWarning(channels: readonly RentReminderChannel[], who: string): string {
  return `The last ${rentReminderChannelWords(channels)} may already have reached ${who}. ${possiblySentAdvice(channels, who)}`;
}
