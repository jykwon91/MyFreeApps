import type { RentReminderChannel } from "./rent-reminder-channel";

/** What the operator was shown. The server sends nothing if it has changed. */
export interface RentReminderSendNowArgs {
  applicantId: string;
  due_date: string;
  amount: string;
  message: string;
  channels: RentReminderChannel[];
}
