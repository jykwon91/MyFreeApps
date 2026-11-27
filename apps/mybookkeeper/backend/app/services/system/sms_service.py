"""MyBookkeeper SMS — texts sent from the operator's Twilio number.

Thin wrapper over ``platform_shared.services.sms_service`` (mirrors how
``email_service`` wraps the shared EmailService). SMS is optional in MBK: it is
*available* only when ``SMS_BACKEND=twilio`` and the account SID, auth token
and sending number are all set (the lifespan's ``sms_optional`` boot guard
refuses to start with only some of them). The auth token is also what
verifies Twilio's webhooks: the status callbacks, which are the only way a
text is ever confirmed, and the texts tenants send back.

There is no console fallback on purpose: an unconfigured deployment reports
SMS as unavailable (the UI says so and the API refuses to enable it) rather
than pretending to send.
"""
from __future__ import annotations

from collections.abc import Mapping
from urllib.parse import urlencode

from platform_shared.services.phone_number import parse_e164, to_e164
from platform_shared.services.sms_service import SmsService
from platform_shared.services.twilio_webhook import (
    TwilioWebhookAuthError,
    verify_twilio_signature,
)

from app.core.config import settings
from app.core.rent_reminder_constants import (
    SMS_INBOUND_PUBLIC_PATH,
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


def is_sending_number(number: str | None) -> bool:
    """Whether ``number``, exactly as Twilio reports it, is the number reminders go out from."""
    sending = from_number()
    received = parse_e164(number)
    if sending is None or received is None:
        return False
    return received == to_e164(sending)


def _webhook_url(path: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}{path}"


def status_callback_url(request_id: str) -> str:
    """The public URL Twilio reports this text's status to."""
    return (
        f"{_webhook_url(SMS_WEBHOOK_PUBLIC_PATH)}"
        f"?{urlencode({SMS_WEBHOOK_REQUEST_ID_PARAM: request_id})}"
    )


def _verify(
    path: str, *, query_string: str, params: Mapping[str, str], signature: str | None,
) -> None:
    """Raise ``TwilioWebhookAuthError`` unless Twilio signed this request to ``path``.

    Twilio signs the URL it was given, so it is rebuilt from the public origin
    plus the request's raw query string rather than read off the request.
    """
    url = _webhook_url(path)
    if query_string:
        url = f"{url}?{query_string}"
    verify_twilio_signature(
        auth_token=settings.twilio_auth_token if is_configured() else "",
        url=url,
        params=params,
        signature=signature,
    )


def verify_status_callback(
    *, query_string: str, params: Mapping[str, str], signature: str | None,
) -> None:
    """Raise ``TwilioWebhookAuthError`` unless Twilio signed this callback.

    The query string carries the ``request_id`` we put there, so a signed
    callback can't be moved onto another try.
    """
    _verify(SMS_WEBHOOK_PUBLIC_PATH, query_string=query_string, params=params, signature=signature)


def verify_inbound_message(
    *, query_string: str, params: Mapping[str, str], signature: str | None,
) -> None:
    """Raise ``TwilioWebhookAuthError`` unless this incoming text came from our Twilio account.

    Besides the signature, the message must name our Account SID, so a request
    signed for another account is never taken as one of ours.
    """
    _verify(SMS_INBOUND_PUBLIC_PATH, query_string=query_string, params=params, signature=signature)
    if params.get("AccountSid") != settings.twilio_account_sid:
        raise TwilioWebhookAuthError("incoming message is for another Twilio account")


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
