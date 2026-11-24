import type { RentReminderSend } from "../types/rent/rent-reminder-send";

/** A text handed to the phone that relays it, which hasn't yet reported
 *  whether it went out. The app says the phone has it, never that it went out. */
export function isTextHandedOff(row: Pick<RentReminderSend, "status">): boolean {
  return row.status === "sent_to_phone";
}
