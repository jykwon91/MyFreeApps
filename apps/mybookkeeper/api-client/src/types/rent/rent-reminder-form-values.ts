import type { RentReminderFrequency } from "./rent-reminder-frequency";

/** What a reminder form holds while it's being edited: the plan's fields as the person typed them. */
export interface RentReminderFormValues {
  frequency: RentReminderFrequency;
  dueWeekday: number;
  /** Text, so a half-typed number is still a value. */
  sendDaysBefore: string;
  /** "HH:MM". */
  sendTime: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  paymentInstructions: string;
  amountOverride: string;
  isActive: boolean;
}
