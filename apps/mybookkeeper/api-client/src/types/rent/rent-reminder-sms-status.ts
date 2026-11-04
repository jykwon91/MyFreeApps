/** Whether this server can send texts, and from which number. */
export interface RentReminderSmsStatus {
  available: boolean;
  from_number: string | null;
  /** Message bodies are end-to-end encrypted through the relay. */
  encrypted: boolean;
  webhook_url: string;
}
