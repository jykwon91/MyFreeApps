"""Canonical string values for rent reminders.

String + ``CheckConstraint`` per RENTALS_PLAN.md §4.1, never SQLAlchemy
``Enum``. Referenced by the models, the migration DDL, the request schemas,
and mirrored as TypeScript unions in ``frontend/src/shared/types/rent/``.
"""

# How often the tenant is reminded. Independent of the schedule's *obligation*
# cadence: a tenant charged monthly who pays every Sunday gets a ``weekly``
# plan whose amount is that month's charge split across its Sundays.
RENT_REMINDER_FREQUENCIES: tuple[str, ...] = ("weekly", "monthly")

RENT_REMINDER_CHANNELS: tuple[str, ...] = ("email", "sms")

# Lifecycle of one reminder on one channel.
#
#   queued         claimed by a tick (or "send now"), not yet handed off. A row
#                  that never leaves this state means the process died mid-send;
#                  the watchdog fails it rather than risk a duplicate.
#   sent           email accepted by SMTP / sms confirmed sent by the phone
#   sent_to_phone  sms accepted by httpSMS, waiting for the phone to report
#   delivered      sms delivery report received from the carrier
#   failed         gave up — ``error_code`` says why
RENT_REMINDER_SEND_STATUSES: tuple[str, ...] = (
    "queued",
    "sent_to_phone",
    "sent",
    "delivered",
    "failed",
)

RENT_REMINDER_EMAIL_STATUSES: tuple[str, ...] = ("queued", "sent", "failed")

# Statuses the watchdog still owes an outcome for.
RENT_REMINDER_PENDING_STATUSES: tuple[str, ...] = ("queued", "sent_to_phone")


def _sql_in_list(values: tuple[str, ...]) -> str:
    return "(" + ", ".join(f"'{v}'" for v in values) + ")"


RENT_REMINDER_FREQUENCIES_SQL = _sql_in_list(RENT_REMINDER_FREQUENCIES)
RENT_REMINDER_CHANNELS_SQL = _sql_in_list(RENT_REMINDER_CHANNELS)
RENT_REMINDER_SEND_STATUSES_SQL = _sql_in_list(RENT_REMINDER_SEND_STATUSES)
RENT_REMINDER_EMAIL_STATUSES_SQL = _sql_in_list(RENT_REMINDER_EMAIL_STATUSES)
RENT_REMINDER_PENDING_STATUSES_SQL = _sql_in_list(RENT_REMINDER_PENDING_STATUSES)
