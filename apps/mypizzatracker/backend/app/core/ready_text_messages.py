"""Why an order-ready text didn't go out, as the service dashboard shows it.

Twilio's error text can quote the customer's number and its own wording, so
the send logs it and returns one of these as ``sms_error`` instead. The web
dashboard shows it inside "SMS not sent (...). Please text <phone> manually.",
so each is a short lowercase phrase. Codes are Twilio's documented error codes
(https://www.twilio.com/docs/api/errors).
"""
from __future__ import annotations

from typing import Final

READY_TEXT_NOT_CONFIGURED_REASON: Final = "SMS service is not configured"
READY_TEXT_REJECTED_REASON: Final = "the text service rejected it"
READY_TEXT_UNREACHABLE_SERVICE_REASON: Final = "the text service couldn't be reached"
READY_TEXT_OUTCOME_UNKNOWN_REASON: Final = "the text service didn't confirm the send"

READY_TEXT_REASON_BY_TWILIO_CODE: Final[dict[int, str]] = {
    21211: "the phone number isn't valid",
    21408: "texts to this region aren't enabled",
    21610: "the customer has opted out of texts",
    21614: "the phone number can't receive texts",
    30001: "the text service was too busy",
    30003: "the phone couldn't be reached",
    30005: "the phone couldn't be reached",
    30007: "the carrier blocked the text",
}
