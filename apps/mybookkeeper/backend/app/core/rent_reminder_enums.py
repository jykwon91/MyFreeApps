"""Canonical string values for rent reminders.

String + ``CheckConstraint`` per RENTALS_PLAN.md §4.1, never SQLAlchemy
``Enum``. Referenced by the models, the migration DDL, the request schemas,
and mirrored as TypeScript unions in ``api-client/src/types/rent/``.
"""
from typing import get_args

from app.core.rent_reminder_channel import RentReminderChannel
from app.core.sql_in_list import sql_in_list


# How often the tenant is reminded. Independent of the schedule's *obligation*
# cadence: a tenant charged monthly who pays every Sunday gets a ``weekly``
# plan whose amount is that month's charge split across its Sundays.
RENT_REMINDER_FREQUENCIES: tuple[str, ...] = ("weekly", "monthly")

RENT_REMINDER_CHANNEL_EMAIL: RentReminderChannel = "email"
RENT_REMINDER_CHANNEL_SMS: RentReminderChannel = "sms"
RENT_REMINDER_CHANNELS: tuple[RentReminderChannel, ...] = get_args(RentReminderChannel)

# Lifecycle of one reminder on one channel.
#
#   queued         claimed by a tick (or "send now"), not yet handed off. A row
#                  that never leaves this state means the process died mid-send;
#                  the watchdog fails it rather than risk a duplicate.
#   sent              email accepted by SMTP / sms handed to the carrier by Twilio
#   sent_to_provider  sms accepted by Twilio, waiting for its status callback
#   delivered         sms delivery report received from the carrier
#   failed            gave up — ``error_code`` says why
RENT_REMINDER_SEND_STATUSES: tuple[str, ...] = (
    "queued",
    "sent_to_provider",
    "sent",
    "delivered",
    "failed",
)

RENT_REMINDER_EMAIL_STATUSES: tuple[str, ...] = ("queued", "sent", "failed")

# Statuses the watchdog still owes an outcome for.
RENT_REMINDER_PENDING_STATUSES: tuple[str, ...] = ("queued", "sent_to_provider")


RENT_REMINDER_FREQUENCIES_SQL = sql_in_list(RENT_REMINDER_FREQUENCIES)
RENT_REMINDER_CHANNELS_SQL = sql_in_list(RENT_REMINDER_CHANNELS)
RENT_REMINDER_SEND_STATUSES_SQL = sql_in_list(RENT_REMINDER_SEND_STATUSES)
RENT_REMINDER_EMAIL_STATUSES_SQL = sql_in_list(RENT_REMINDER_EMAIL_STATUSES)
RENT_REMINDER_PENDING_STATUSES_SQL = sql_in_list(RENT_REMINDER_PENDING_STATUSES)
