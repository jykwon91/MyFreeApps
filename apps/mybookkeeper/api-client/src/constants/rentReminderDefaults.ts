import type { RentReminderFrequency } from "../types/rent/rent-reminder-frequency";

/** ``due_weekday`` for a Sunday (0 = Monday … 6 = Sunday). */
export const SUNDAY = 6;

/** Mirrors ``DEFAULT_SEND_DAYS_BEFORE`` in ``rent_reminder_constants.py``: a day
 *  ahead for a weekly payer, three for a monthly one. */
export const DEFAULT_SEND_DAYS_BEFORE: Record<RentReminderFrequency, number> = {
  weekly: 1,
  monthly: 3,
};

/** Upper bounds the backend enforces (a weekly reminder sent 7+ days ahead
 *  would land before the previous week's due date). */
export const MAX_SEND_DAYS_BEFORE: Record<RentReminderFrequency, number> = {
  weekly: 6,
  monthly: 14,
};

export const DEFAULT_SEND_TIME = "18:00";
export const DEFAULT_TIMEZONE = "America/Chicago";
/** Reminders only go out between 9am and 8pm local time. */
export const SEND_TIME_MIN = "09:00";
export const SEND_TIME_MAX = "19:59";
