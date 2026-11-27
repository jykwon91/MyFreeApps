"""Shared SMS constants: Twilio HTTP tuning and the provider codes every sender uses.

The Twilio SDK's own default is no timeout at all, so a stalled Twilio would
block the calling thread forever. A healthy create-message call answers in
well under a second; this bounds a stall to a few seconds.
"""
from __future__ import annotations

from typing import Final

# Seconds allowed to connect to Twilio, and again for each wait on a response
# (the ``requests`` timeout semantics). The send is not retried: a message
# create is not idempotent, so a retry after a timeout could text twice.
TWILIO_HTTP_TIMEOUT_SECONDS: Final = 10.0

# ``SmsSendError.provider_code`` when the provider could not be reached at all
# (DNS failure, connection refused, connect timeout). Nothing was sent, so a
# resend is safe.
SMS_PROVIDER_CODE_NETWORK_ERROR: Final = "network_error"

# ``SmsSendError.provider_code`` when the request may have reached the provider
# but no usable answer came back (a read or write failure, a timeout while
# waiting for the reply). The text may have gone out, so a caller must never
# resend it on its own. ``SmsSendError.outcome_unknown`` is set for this and
# for the other unknown outcomes (a provider 5xx, an unreadable 2xx), so
# callers check that flag rather than this code.
SMS_PROVIDER_CODE_OUTCOME_UNKNOWN: Final = "outcome_unknown"


# ``MessageStatus`` values Twilio POSTs to a message's status callback
# (https://www.twilio.com/docs/messaging/api/message-resource#message-status-values).
# ``queued`` / ``sending`` / ``accepted`` / ``scheduled`` are steps before the
# carrier has it, so a sender only acts on these four.
TWILIO_STATUS_SENT: Final = "sent"
TWILIO_STATUS_DELIVERED: Final = "delivered"
TWILIO_STATUS_UNDELIVERED: Final = "undelivered"
TWILIO_STATUS_FAILED: Final = "failed"

# The header Twilio signs every webhook with (HMAC-SHA1 of the URL and the
# sorted form parameters, keyed by the account's auth token).
TWILIO_SIGNATURE_HEADER: Final = "X-Twilio-Signature"

# Twilio posts its webhooks (status callbacks and incoming messages) as a form;
# a body of any other type isn't one.
TWILIO_CALLBACK_MEDIA_TYPE: Final = "application/x-www-form-urlencoded"

# The answer to an incoming-message webhook that sends nothing back. Twilio texts
# the body of a ``text/plain`` answer to the sender, and logs an error for one it
# can't read as TwiML, so "no reply" has to be this. It is exactly what the SDK
# renders for an empty ``MessagingResponse()``.
TWILIO_EMPTY_TWIML: Final = '<?xml version="1.0" encoding="UTF-8"?><Response />'
TWILIO_TWIML_MEDIA_TYPE: Final = "text/xml"

# Most pictures or files one incoming message can carry (``NumMedia``).
TWILIO_MAX_MEDIA: Final = 10

# Twilio's default opt-out keywords, matched against the whole message in any
# case. A reply that is one of these blocks every later text from that number
# to the sender (sends fail with error 21610) until they text a START keyword.
TWILIO_STOP_KEYWORDS: Final = frozenset(
    {"STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"},
)
# Keywords that lift the block. Long codes also take YES, toll-free numbers
# (what MyFreeApps texts from) only these two, so YES is left out.
TWILIO_START_KEYWORDS: Final = frozenset({"START", "UNSTOP"})
