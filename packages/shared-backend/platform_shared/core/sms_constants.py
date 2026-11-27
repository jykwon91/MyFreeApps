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

# Twilio posts status callbacks as a form; a body of any other type isn't one.
TWILIO_CALLBACK_MEDIA_TYPE: Final = "application/x-www-form-urlencoded"
