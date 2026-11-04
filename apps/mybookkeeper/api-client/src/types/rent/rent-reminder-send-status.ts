/** Lifecycle of one reminder send. Mirrors ``RENT_REMINDER_SEND_STATUSES`` in
 *  ``backend/app/core/rent_reminder_enums.py``.
 *
 *  - `queued`: claimed, not yet handed off
 *  - `sent_to_phone`: text handed to the Android phone, awaiting its report
 *  - `sent`: email accepted by the mail server, or text sent by the phone
 *  - `delivered`: the carrier confirmed the text arrived
 *  - `failed`: did not go out (see `error_code`)
 */
export type RentReminderSendStatus =
  | "queued"
  | "sent_to_phone"
  | "sent"
  | "delivered"
  | "failed";
