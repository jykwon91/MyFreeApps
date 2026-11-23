"""What the operator's alert says when a rent reminder didn't go out, or may
have gone out with nothing to confirm it.

``rent_reminder_alert_service`` picks among these by the reminder's channel
and error code.
"""
from __future__ import annotations

from collections.abc import Mapping
from types import MappingProxyType

from app.core.rent_reminder_channel import RentReminderChannel
from app.core.rent_reminder_constants import (
    ERROR_EMAIL_NOT_CONFIGURED,
    ERROR_EMAIL_OUTCOME_UNKNOWN,
    ERROR_EMAIL_SEND_FAILED,
    ERROR_INVALID_PHONE,
    ERROR_NO_SMS_CONFIRMATION,
    ERROR_SEND_INTERRUPTED,
    ERROR_SMS_NETWORK,
    ERROR_SMS_NOT_CONFIGURED,
    ERROR_SMS_OUTCOME_UNKNOWN,
    ERROR_UNEXPECTED,
    TWILIO_MESSAGE_LOG_URL,
)
from app.core.rent_reminder_enums import RENT_REMINDER_CHANNEL_EMAIL, RENT_REMINDER_CHANNEL_SMS

# What the alert calls the reminder, by channel.
REMINDER_NAME: Mapping[RentReminderChannel, str] = MappingProxyType({
    RENT_REMINDER_CHANNEL_SMS: "rent text",
    RENT_REMINDER_CHANNEL_EMAIL: "rent reminder email",
})
# Where to check whether a reminder that may have gone out did, by channel.
# Only texts leave a log (Twilio's); an email can only be checked with the
# tenant.
CHECK_WHETHER_SENT: Mapping[RentReminderChannel, str] = MappingProxyType({
    RENT_REMINDER_CHANNEL_SMS: (
        f"check the messaging logs in the Twilio console ({TWILIO_MESSAGE_LOG_URL}), "
        "or ask the tenant,"
    ),
    RENT_REMINDER_CHANNEL_EMAIL: "ask the tenant whether it arrived",
})
RETRY = (
    "If nothing else went out for this due date, you can retry from the "
    "tenant's Rent reminders card with Send now. If the other channel did go "
    "out, Send now won't resend this one, so contact the tenant yourself if "
    "they still need it."
)
# Why a reminder failed, as the operator would put it, for each code with a
# fixed spelling but ``no_recipient``, whose words depend on the channel.
WHAT_HAPPENED: Mapping[str, str] = MappingProxyType({
    # The watchdog can mark a text sent before the move to Twilio this way, so
    # this doesn't say who took it.
    ERROR_NO_SMS_CONFIRMATION: "It was handed off for sending, but no report ever came back on whether it went out.",
    ERROR_SEND_INTERRUPTED: "Sending was interrupted before it was confirmed.",
    ERROR_INVALID_PHONE: "The tenant's phone number isn't valid. Fix it on their record, area code included.",
    ERROR_SMS_NOT_CONFIGURED: "Text reminders are switched on but Twilio isn't configured on the server.",
    ERROR_SMS_NETWORK: "The server couldn't reach Twilio, so the text wasn't sent.",
    ERROR_SMS_OUTCOME_UNKNOWN: "Twilio didn't confirm it took the text.",
    ERROR_EMAIL_NOT_CONFIGURED: "Email isn't set up on the server.",
    ERROR_EMAIL_SEND_FAILED: "The mail server didn't take it.",
    ERROR_EMAIL_OUTCOME_UNKNOWN: "The mail server didn't confirm it took the email.",
    ERROR_UNEXPECTED: "Something went wrong sending it.",
})
# What ``no_recipient`` says is missing, by channel.
MISSING_CONTACT: Mapping[RentReminderChannel, str] = MappingProxyType({
    RENT_REMINDER_CHANNEL_SMS: "phone number",
    RENT_REMINDER_CHANNEL_EMAIL: "email address",
})
# Twilio's page for each of its error numbers, followed by the number.
TWILIO_ERROR_DOCS_URL = "https://www.twilio.com/docs/api/errors/"
# What to fix first when Twilio refused a text for a reason on the server's
# side, by Twilio error number. Every text fails the same way until it's fixed.
TWILIO_REFUSED_FIX: Mapping[str, str] = MappingProxyType({
    "20003": (
        "Twilio didn't accept the server's account SID or auth token. Copy both "
        "from the Twilio console into TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN "
        "on the server and redeploy the app before retrying."
    ),
})
