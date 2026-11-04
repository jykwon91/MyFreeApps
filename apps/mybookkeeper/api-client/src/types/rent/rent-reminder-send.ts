import type { RentReminderChannel } from "./rent-reminder-channel";
import type { RentReminderSendStatus } from "./rent-reminder-send-status";

/** One row of a tenant's reminder history. */
export interface RentReminderSend {
  id: string;
  due_date: string;
  channel: RentReminderChannel;
  status: RentReminderSendStatus;
  amount: string;
  error_code: string | null;
  created_at: string;
  sent_at: string | null;
  confirmed_at: string | null;
}
