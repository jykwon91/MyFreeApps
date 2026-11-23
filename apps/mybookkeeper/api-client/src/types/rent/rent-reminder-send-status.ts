/** Lifecycle of one reminder send. Mirrors ``RENT_REMINDER_SEND_STATUSES`` in
 *  ``backend/app/core/rent_reminder_enums.py``.
 *
 *  - `queued`: claimed, not yet handed off
 *  - `sent_to_provider`: text handed to Twilio, awaiting its status report
 *  - `sent`: email accepted by the mail server, or text passed to the carrier by Twilio
 *  - `delivered`: the carrier confirmed the text arrived
 *  - `failed`: gave up. It didn't go out, or may have with nothing to
 *    confirm it (`error_code` says which)
 */
export const RENT_REMINDER_SEND_STATUSES = {
  QUEUED: "queued",
  SENT_TO_PROVIDER: "sent_to_provider",
  SENT: "sent",
  DELIVERED: "delivered",
  FAILED: "failed",
} as const;

export type RentReminderSendStatus =
  (typeof RENT_REMINDER_SEND_STATUSES)[keyof typeof RENT_REMINDER_SEND_STATUSES];
