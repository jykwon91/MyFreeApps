import type { RentReminderChannel } from "./rent-reminder-channel";
import type { RentReminderPossiblySent } from "./rent-reminder-possibly-sent";

/** The next reminder, rendered exactly as it will go out. */
export interface RentReminderPreview {
  due_date: string;
  /** ISO timestamp with offset — when it becomes sendable. */
  send_at: string;
  amount: string;
  period_start: string;
  period_end: string;
  /** As it will read on the day it goes out on schedule. */
  message: string;
  /** As it would read if sent right now. Send this back to send-now. */
  send_now_message: string;
  /** Channels that already went out (or are in flight) for this due date.
   *  A failed send is not listed — it can be retried. */
  sent_channels: RentReminderChannel[];
  /** Enabled channels whose failed try may still have reached the tenant.
   *  Sending again needs these echoed back in `confirmed_possibly_sent`. */
  possibly_sent: RentReminderPossiblySent[];
}
