"""Where a rent reminder goes. ``RENT_REMINDER_CHANNELS`` is read from it, and
the api-client's ``RentReminderChannel`` mirrors it.

The order matters: the preview lists channels in it, and the table's checks
are written in it, as the migration that created them spelled them.
"""
from typing import Literal

RentReminderChannel = Literal["email", "sms"]
