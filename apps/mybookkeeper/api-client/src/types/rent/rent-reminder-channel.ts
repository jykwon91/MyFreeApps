/** Where a reminder goes. Mirrors ``RentReminderChannel`` in
 *  ``backend/app/core/rent_reminder_channel.py``. */
export const RENT_REMINDER_CHANNELS = {
  EMAIL: "email",
  SMS: "sms",
} as const;

export type RentReminderChannel = (typeof RENT_REMINDER_CHANNELS)[keyof typeof RENT_REMINDER_CHANNELS];
