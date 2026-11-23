"""The shape of a check that Twilio signed a webhook request (``sms_service.verify_*``)."""
from __future__ import annotations

from collections.abc import Mapping
from typing import Protocol


class TwilioRequestVerifier(Protocol):
    def __call__(
        self, *, query_string: str, params: Mapping[str, str], signature: str | None,
    ) -> None:
        """Raise ``TwilioWebhookAuthError`` unless Twilio signed the request."""
