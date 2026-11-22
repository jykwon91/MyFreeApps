import type { RentReminderChannel } from "./rent-reminder-channel";
import type { RentReminderPossiblySent } from "./rent-reminder-possibly-sent";

/** What the operator was shown. The server sends nothing if it has changed. */
export interface RentReminderSendNowArgs {
  applicantId: string;
  due_date: string;
  amount: string;
  message: string;
  channels: RentReminderChannel[];
  /** The preview's `possibly_sent` the operator saw and chose to send again
   *  despite. If the tries have changed since, nothing is sent (412). */
  confirmed_possibly_sent?: RentReminderPossiblySent[];
}
