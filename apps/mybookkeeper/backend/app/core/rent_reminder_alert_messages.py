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
    ERROR_NO_PHONE_CONFIRMATION,
    ERROR_SEND_INTERRUPTED,
    ERROR_SMS_EXPIRED,
    ERROR_SMS_KEY_REJECTED,
    ERROR_SMS_NETWORK,
    ERROR_SMS_NOT_CONFIGURED,
    ERROR_SMS_OUTCOME_UNKNOWN,
    ERROR_UNEXPECTED,
    SMS_CONFIRMATION_TIMEOUT_MINUTES,
)
from app.core.rent_reminder_enums import RENT_REMINDER_CHANNEL_EMAIL, RENT_REMINDER_CHANNEL_SMS

# What the alert calls the reminder, by channel.
REMINDER_NAME: Mapping[RentReminderChannel, str] = MappingProxyType({
    RENT_REMINDER_CHANNEL_SMS: "rent text",
    RENT_REMINDER_CHANNEL_EMAIL: "rent reminder email",
})
# Where to check whether a reminder that may have gone out did, by channel.
# Only texts leave a log (httpSMS's); an email can only be checked with the
# tenant.
CHECK_WHETHER_SENT: Mapping[RentReminderChannel, str] = MappingProxyType({
    RENT_REMINDER_CHANNEL_SMS: "check the message log on httpsms.com (or the phone's Messages app)",
    RENT_REMINDER_CHANNEL_EMAIL: "ask the tenant whether it arrived",
})
RETRY = (
    "If nothing else went out for this due date, you can retry from the "
    "tenant's Rent reminders card with Send now. If the other channel did go "
    "out, Send now won't resend this one, so contact the tenant yourself if "
    "they still need it."
)
# What to fix when the phone let a text down. It is never the tenant's contact
# details then.
PHONE_CHECKLIST = (
    "Make sure the Android phone is on, online, and that httpSMS isn't "
    "battery-optimized (Settings > Apps > httpSMS > Battery > Unrestricted)."
)
# Why a reminder failed, as the operator would put it, for each code with a
# fixed spelling but ``no_recipient``, whose words depend on the channel.
WHAT_HAPPENED: Mapping[str, str] = MappingProxyType({
    ERROR_NO_PHONE_CONFIRMATION: (
        "The phone didn't confirm it sent the text within "
        f"{SMS_CONFIRMATION_TIMEOUT_MINUTES} minutes. {PHONE_CHECKLIST}"
    ),
    ERROR_SMS_EXPIRED: f"The phone didn't send the text in time, so httpSMS gave up on it. {PHONE_CHECKLIST}",
    ERROR_SEND_INTERRUPTED: "Sending was interrupted before it was confirmed.",
    ERROR_INVALID_PHONE: "The tenant's phone number couldn't be read. Re-enter it with the area code.",
    ERROR_SMS_NOT_CONFIGURED: "Text reminders are switched on but httpSMS isn't configured on the server.",
    ERROR_SMS_NETWORK: "The server couldn't reach httpSMS, so the text wasn't sent.",
    ERROR_SMS_KEY_REJECTED: (
        "httpSMS rejected the server's API key, so the text wasn't sent. "
        "Copy the API key from httpsms.com (Settings > API Key) into "
        "HTTPSMS_API_KEY on the server and redeploy the app before retrying."
    ),
    ERROR_SMS_OUTCOME_UNKNOWN: "httpSMS didn't confirm it took the text.",
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
