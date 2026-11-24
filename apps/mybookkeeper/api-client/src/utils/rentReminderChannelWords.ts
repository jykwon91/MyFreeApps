import { RENT_REMINDER_CHANNEL_LABEL } from "../constants/rentReminderLabels";
import type { RentReminderChannel } from "../types/rent/rent-reminder-channel";
import { joinWithAnd } from "./formatList";

/** A channel as a sentence names it: "email" or "text". */
export function rentReminderChannelWord(channel: RentReminderChannel): string {
  return RENT_REMINDER_CHANNEL_LABEL[channel].toLowerCase();
}

/** Channels as a sentence lists them, in the order given: "email and text". */
export function rentReminderChannelWords(channels: readonly RentReminderChannel[]): string {
  return joinWithAnd(channels.map(rentReminderChannelWord));
}
