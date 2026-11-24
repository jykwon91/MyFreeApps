/** Whether this server can send texts, whether the plan's owner may send them, and from which Twilio number. */
export interface RentReminderSmsStatus {
  available: boolean;
  /** Whether the plan's owner (the caller, before there's a plan) may send texts. The server decides. */
  allowed: boolean;
  from_number: string | null;
}
