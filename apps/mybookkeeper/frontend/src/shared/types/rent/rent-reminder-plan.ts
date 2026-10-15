import type { RentReminderFrequency } from "./rent-reminder-frequency";

/** A tenant's rent-reminder settings. */
export interface RentReminderPlan {
  id: string;
  applicant_id: string;
  frequency: RentReminderFrequency;
  /** 0 = Monday … 6 = Sunday. Set for weekly plans only. */
  due_weekday: number | null;
  send_days_before: number;
  /** Local wall-clock time, "HH:MM:SS". */
  send_time: string;
  timezone: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  amount_override: string | null;
  payment_instructions: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
