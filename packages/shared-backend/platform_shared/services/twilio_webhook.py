"""Verify and read Twilio webhooks (message status callbacks).

Twilio signs every webhook with ``X-Twilio-Signature``: HMAC-SHA1, keyed by the
account's auth token, over the full URL it called followed by every POSTed
form parameter, sorted by name. ``verify_twilio_signature`` checks it with the
SDK's own ``RequestValidator`` so the algorithm is never re-implemented here.

The URL must be the one Twilio was given, byte for byte, query string
included. Behind a reverse proxy the request arrives on an internal host over
plain http, so callers rebuild it from their public origin rather than reading
it off the request.

Usage:
    signature = request.headers.get(TWILIO_SIGNATURE_HEADER)
    check_twilio_callback_headers(
        signature=signature, content_type=request.headers.get("content-type"),
    )
    params = dict(await request.form())
    verify_twilio_signature(
        auth_token=settings.twilio_auth_token,
        url=f"{public_origin}{path}?{request.url.query}",
        params=params,
        signature=signature,
    )
    event = parse_twilio_status_callback(params)

Imports ``twilio`` at module load, so only apps that depend on it import this.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from twilio.request_validator import RequestValidator

from platform_shared.core.sms_constants import TWILIO_CALLBACK_MEDIA_TYPE


class TwilioWebhookAuthError(ValueError):
    """The request was not signed by Twilio with the configured auth token."""


def check_twilio_callback_headers(*, signature: str | None, content_type: str | None) -> None:
    """Refuse a request Twilio didn't send, before its body is read.

    Twilio signs every callback and posts it form-encoded, so a request with
    no signature, or with any other kind of body, is rejected without parsing
    the body.

    Raises:
        TwilioWebhookAuthError: When the signature is missing or the body
            isn't a form.
    """
    if not signature:
        raise TwilioWebhookAuthError("missing X-Twilio-Signature")
    media_type = (content_type or "").split(";", 1)[0].strip().lower()
    if media_type != TWILIO_CALLBACK_MEDIA_TYPE:
        raise TwilioWebhookAuthError("callback body is not form-encoded")


def verify_twilio_signature(
    *, auth_token: str, url: str, params: Mapping[str, str], signature: str | None,
) -> None:
    """Reject any webhook Twilio did not sign with ``auth_token``.

    An unsigned request, or a deployment with no auth token, is rejected
    outright: accepting unauthenticated status updates would let anyone mark a
    text delivered.

    Raises:
        TwilioWebhookAuthError: On a missing or wrong signature.
    """
    if not auth_token:
        raise TwilioWebhookAuthError("Twilio auth token is not configured")
    if not signature:
        raise TwilioWebhookAuthError("missing X-Twilio-Signature")
    if not RequestValidator(auth_token).validate(url, dict(params), signature):
        raise TwilioWebhookAuthError("invalid X-Twilio-Signature")


@dataclass(frozen=True)
class TwilioStatusEvent:
    """The parts of a message status callback a sender acts on."""

    message_sid: str | None
    status: str
    # Twilio's numeric error code as sent (e.g. ``"30007"``); only on
    # ``undelivered`` / ``failed``.
    error_code: str | None


def parse_twilio_status_callback(params: Mapping[str, str]) -> TwilioStatusEvent:
    """Read the routing fields from a status callback's form parameters.

    ``SmsStatus`` / ``SmsSid`` are the deprecated spellings Twilio still sends
    alongside ``MessageStatus`` / ``MessageSid``; they are only a fallback.
    """
    status = (params.get("MessageStatus") or params.get("SmsStatus") or "").strip().lower()
    message_sid = (params.get("MessageSid") or params.get("SmsSid") or "").strip()
    error_code = (params.get("ErrorCode") or "").strip()
    return TwilioStatusEvent(
        message_sid=message_sid or None,
        status=status,
        error_code=error_code or None,
    )
