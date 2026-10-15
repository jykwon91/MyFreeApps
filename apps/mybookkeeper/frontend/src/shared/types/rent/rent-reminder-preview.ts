import type { RentReminderChannel } from "./rent-reminder-channel";

/** The next reminder, rendered exactly as it will go out. */
export interface RentReminderPreview {
  due_date: string;
  /** ISO timestamp with offset — when it becomes sendable. */
  send_at: string;
  amount: string;
  period_start: string;
  period_end: string;
  message: string;
  /** Channels that already went out (or are in flight) for this due date.
   *  A failed send is not listed — it can be retried. */
  sent_channels: RentReminderChannel[];
}
