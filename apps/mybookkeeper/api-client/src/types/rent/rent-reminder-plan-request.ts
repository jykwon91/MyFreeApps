import type { RentReminderFrequency } from "./rent-reminder-frequency";

/** Body for creating or replacing a reminder plan (the whole plan, every time). */
export interface RentReminderPlanRequest {
  frequency: RentReminderFrequency;
  due_weekday: number | null;
  send_days_before: number;
  send_time: string;
  timezone: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  amount_override: string | null;
  payment_instructions: string | null;
  is_active: boolean;
}
