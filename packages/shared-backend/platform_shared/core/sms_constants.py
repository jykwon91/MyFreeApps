"""HTTP tuning for the Twilio client built in ``platform_shared.services.sms_service``.

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
