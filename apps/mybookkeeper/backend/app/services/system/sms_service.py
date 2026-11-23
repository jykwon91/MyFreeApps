"""MyBookkeeper SMS — texts sent from the operator's Twilio number.

Thin wrapper over ``platform_shared.services.sms_service`` (mirrors how
``email_service`` wraps the shared EmailService). SMS is optional in MBK: it is
*available* only when ``SMS_BACKEND=twilio`` and the account SID, auth token
and sending number are all set (the lifespan's ``sms_optional`` boot guard
refuses to start with only some of them). The auth token is also what
verifies Twilio's status callbacks, which are the only way a text is ever
confirmed.

There is no console fallback on purpose: an unconfigured deployment reports
SMS as unavailable (the UI says so and the API refuses to enable it) rather
than pretending to send.
"""
from __future__ import annotations

from collections.abc import Mapping
from urllib.parse import urlencode

from platform_shared.services.sms_service import SmsService
from platform_shared.services.twilio_webhook import verify_twilio_signature

from app.core.config import settings
from app.core.rent_reminder_constants import (
    SMS_WEBHOOK_PUBLIC_PATH,
    SMS_WEBHOOK_REQUEST_ID_PARAM,
)

_TWILIO_BACKEND = "twilio"


def is_configured() -> bool:
    return (
        settings.sms_backend == _TWILIO_BACKEND
        and bool(settings.twilio_account_sid)
        and bool(settings.twilio_auth_token)
        and bool(settings.twilio_from_number)
    )


def from_number() -> str | None:
    if not is_configured():
        return None
    return settings.twilio_from_number


def _webhook_url() -> str:
    return f"{settings.frontend_url.rstrip('/')}{SMS_WEBHOOK_PUBLIC_PATH}"


def status_callback_url(request_id: str) -> str:
    """The public URL Twilio reports this text's status to."""
    return f"{_webhook_url()}?{urlencode({SMS_WEBHOOK_REQUEST_ID_PARAM: request_id})}"


def verify_status_callback(
    *, query_string: str, params: Mapping[str, str], signature: str | None,
) -> None:
    """Raise ``TwilioWebhookAuthError`` unless Twilio signed this callback.

    Twilio signs the URL it was given, so it is rebuilt from the public origin
    plus the request's raw query string (which carries the ``request_id`` we
    put there, so it can't be moved onto another try).
    """
    url = _webhook_url()
    if query_string:
        url = f"{url}?{query_string}"
    verify_twilio_signature(
        auth_token=settings.twilio_auth_token if is_configured() else "",
        url=url,
        params=params,
        signature=signature,
    )


def _service() -> SmsService:
    return SmsService(
        account_sid=settings.twilio_account_sid,
        auth_token=settings.twilio_auth_token,
        from_number=settings.twilio_from_number,
    )


def send_or_raise(to: str, body: str, *, request_id: str) -> str:
    """Hand a text to Twilio. Returns the Twilio Message SID.

    Its status callbacks come back to the webhook carrying ``request_id``.
    Raises ``SmsNotConfiguredError`` / ``SmsSendError`` / ``ValueError`` from
    the shared sender.
    """
    return _service().send_or_raise(to, body, status_callback=status_callback_url(request_id))
