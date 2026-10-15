"""MyBookkeeper SMS — texts sent from the operator's Android phone via httpSMS.

Thin wrapper over ``platform_shared.services.httpsms_service`` (mirrors how
``email_service`` wraps the shared EmailService). SMS is optional in MBK: it is
*available* only when ``SMS_BACKEND=httpsms`` and the API key, sending number
and webhook signing key are all set. The signing key is part of the bar
because a text is only ever confirmed by a signed webhook — without it every
text would end up failed by the watchdog.

There is no console fallback on purpose: an unconfigured deployment reports
SMS as unavailable (the UI says so and the API refuses to enable it) rather
than pretending to send.
"""
from __future__ import annotations

from platform_shared.services.httpsms_service import HttpSmsService

from app.core.config import settings
from app.core.rent_reminder_constants import SMS_WEBHOOK_PUBLIC_PATH

_HTTPSMS_BACKEND = "httpsms"


def is_configured() -> bool:
    return (
        settings.sms_backend == _HTTPSMS_BACKEND
        and bool(settings.httpsms_api_key)
        and bool(settings.httpsms_from_number)
        and bool(settings.httpsms_webhook_signing_key)
    )


def from_number() -> str | None:
    if not is_configured():
        return None
    return settings.httpsms_from_number


def encrypts_messages() -> bool:
    return bool(settings.httpsms_encryption_key)


def webhook_url() -> str:
    """The URL to register in httpSMS — also the JWT audience we verify against."""
    return f"{settings.frontend_url.rstrip('/')}{SMS_WEBHOOK_PUBLIC_PATH}"


def webhook_signing_key() -> str:
    return settings.httpsms_webhook_signing_key


def _service() -> HttpSmsService:
    return HttpSmsService(
        api_key=settings.httpsms_api_key,
        from_number=settings.httpsms_from_number,
        encryption_key=settings.httpsms_encryption_key,
    )


def send_or_raise(to: str, body: str, *, request_id: str) -> str:
    """Hand a text to the phone. Returns the httpSMS message id.

    Raises ``SmsNotConfiguredError`` / ``SmsSendError`` / ``ValueError`` from
    the shared sender.
    """
    return _service().send_or_raise(to, body, request_id=request_id)
