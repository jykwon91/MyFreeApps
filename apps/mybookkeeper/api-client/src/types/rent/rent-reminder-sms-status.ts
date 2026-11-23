/** Whether this server can send texts, and from which Twilio number. */
export interface RentReminderSmsStatus {
  available: boolean;
  from_number: string | null;
}
