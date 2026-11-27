import type { RentReminderSend } from "../types/rent/rent-reminder-send";

/** A text handed to Twilio, which hasn't yet reported whether it went out.
 *  The app says Twilio has it, never that it went out. */
export function isTextHandedOff(row: Pick<RentReminderSend, "status">): boolean {
  return row.status === "sent_to_provider";
}
