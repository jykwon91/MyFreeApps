"""httpSMS sender — texts go out from an Android phone running the httpSMS app.

Usage:
    sms = HttpSmsService(
        api_key="...",
        from_number="+15551234567",      # the Android phone's own number
        encryption_key="...",            # optional; same passphrase as the app
    )
    message_id = sms.send_or_raise("+15559876543", "Rent is due tomorrow.")

Same ``send`` / ``send_or_raise`` shape and error types as the Twilio
``SmsService`` in ``platform_shared.services.sms_service``, so an app picks a
backend without its call sites changing.

How it works (https://github.com/NdoleStudio/httpsms):
    POST https://api.httpsms.com/v1/messages/send  (header ``x-api-key``)
    → the API queues the message and pushes it to the phone, which sends it
      with the Android SMS API and reports back. The API answers before the
      phone has done anything, so a 2xx means "handed to the phone", not
      "delivered". Delivery is reported later via webhook (see
      ``verify_httpsms_webhook`` / ``parse_httpsms_event``).

End-to-end encryption:
    When ``encryption_key`` is set the body is encrypted here and sent with
    ``encrypted: true``; only the phone (configured with the same passphrase)
    can decrypt it, so the relay never sees message content. The scheme
    mirrors the Android app's ``Encrypter.kt``: AES-256 in CFB mode (128-bit
    segments), key = SHA-256 of the passphrase, a random 16-byte IV prefixed
    to the ciphertext, the whole thing standard-base64 encoded.

Error codes (rules/check-third-party-error-codes.md):
    API rejections return ``{"status": "error", "message": ..., "data": ...}``
    with a meaningful HTTP status (400 malformed, 401 bad API key, 422
    validation — e.g. a from-number not registered to the account). They are
    logged at WARNING and raised as ``SmsSendError(provider_code="http_<n>")``.
    Phone-side failures arrive asynchronously in the ``message.send.failed``
    webhook's ``error_message``.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import os
from dataclasses import dataclass
from typing import Any

import httpx
import jwt
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from platform_shared.services.sms_service import SmsNotConfiguredError, SmsSendError

logger = logging.getLogger(__name__)

HTTPSMS_DEFAULT_BASE_URL = "https://api.httpsms.com"
HTTPSMS_SEND_PATH = "/v1/messages/send"
HTTPSMS_TIMEOUT_S = 15.0

# Claims httpSMS puts on the webhook bearer JWT (api/pkg/services/webhook_service.go).
HTTPSMS_WEBHOOK_ISSUER = "api.httpsms.com"
HTTPSMS_WEBHOOK_LEEWAY_S = 60

# Outbound-message lifecycle events. ``message.phone.received`` (an inbound
# text) is deliberately absent — a sender has no use for it, and the webhook
# should not be subscribed to it.
HTTPSMS_EVENT_PHONE_SENT = "message.phone.sent"
HTTPSMS_EVENT_PHONE_DELIVERED = "message.phone.delivered"
HTTPSMS_EVENT_SEND_FAILED = "message.send.failed"
HTTPSMS_EVENT_SEND_EXPIRED = "message.send.expired"

_IV_BYTES = 16


class HttpSmsWebhookAuthError(ValueError):
    """The webhook request was not signed with the configured signing key."""


def _derive_key(passphrase: str) -> bytes:
    # SHA-256(passphrase) is the httpSMS wire format — the Android app derives
    # the AES key the same way, so a slow KDF here would make every text
    # undecryptable on the phone. The passphrase is therefore required to be
    # high-entropy (generated, e.g. a 6-word diceware phrase), not memorable.
    return hashlib.sha256(passphrase.encode()).digest()


def encrypt_httpsms_content(passphrase: str, plaintext: str) -> str:
    """Encrypt a message body the way the httpSMS Android app decrypts it."""
    iv = os.urandom(_IV_BYTES)
    encryptor = Cipher(algorithms.AES(_derive_key(passphrase)), modes.CFB(iv)).encryptor()
    ciphertext = encryptor.update(plaintext.encode()) + encryptor.finalize()
    return base64.b64encode(iv + ciphertext).decode()


def decrypt_httpsms_content(passphrase: str, encoded: str) -> str:
    """Inverse of :func:`encrypt_httpsms_content`."""
    raw = base64.b64decode(encoded)
    iv, ciphertext = raw[:_IV_BYTES], raw[_IV_BYTES:]
    decryptor = Cipher(algorithms.AES(_derive_key(passphrase)), modes.CFB(iv)).decryptor()
    return (decryptor.update(ciphertext) + decryptor.finalize()).decode()


def _error_summary(response: httpx.Response) -> tuple[str, Any]:
    try:
        payload = response.json()
    except ValueError:
        return response.text[:200], None
    if not isinstance(payload, dict):
        return str(payload)[:200], None
    return str(payload.get("message", ""))[:200], payload.get("data")


@dataclass
class HttpSmsService:
    api_key: str = ""
    from_number: str = ""
    encryption_key: str = ""
    base_url: str = HTTPSMS_DEFAULT_BASE_URL

    def is_configured(self) -> bool:
        return bool(self.api_key and self.from_number)

    @property
    def encrypts_messages(self) -> bool:
        return bool(self.encryption_key)

    def send_or_raise(self, to: str, body: str, *, request_id: str | None = None) -> str:
        """Hand the SMS to the phone, raising on any failure.

        ``request_id`` is echoed back on every webhook for this message, so a
        caller can match delivery reports to its own record without storing
        anything else.

        Returns:
            The httpSMS message id.

        Raises:
            ValueError: If ``to`` or ``body`` is empty.
            SmsNotConfiguredError: If the API key or from-number is missing.
            SmsSendError: If httpSMS rejects the request or cannot be reached.
        """
        if not to:
            raise ValueError("Recipient phone number cannot be empty")
        if not body:
            raise ValueError("SMS body cannot be empty")
        if not self.is_configured():
            raise SmsNotConfiguredError(
                "httpSMS is not configured (HTTPSMS_API_KEY / HTTPSMS_FROM_NUMBER).",
            )

        payload: dict[str, Any] = {
            "from": self.from_number,
            "to": to,
            "content": (
                encrypt_httpsms_content(self.encryption_key, body)
                if self.encrypts_messages
                else body
            ),
            "encrypted": self.encrypts_messages,
        }
        if request_id:
            payload["request_id"] = request_id

        try:
            response = httpx.post(
                f"{self.base_url.rstrip('/')}{HTTPSMS_SEND_PATH}",
                json=payload,
                headers={"x-api-key": self.api_key, "Accept": "application/json"},
                timeout=HTTPSMS_TIMEOUT_S,
            )
        except httpx.HTTPError as e:
            logger.warning(
                "httpSMS send failed (network): request_id=%s err=%r", request_id, e,
            )
            raise SmsSendError(
                f"httpSMS unreachable: {e}", provider_code="network_error",
            ) from e

        if response.status_code >= 400:
            message, data = _error_summary(response)
            provider_code = f"http_{response.status_code}"
            logger.warning(
                "httpSMS send rejected: status=%s code=%s request_id=%s "
                "message=%s detail=%s",
                response.status_code, provider_code, request_id, message, data,
            )
            raise SmsSendError(
                f"httpSMS rejected SMS (status={response.status_code}): {message}",
                status=response.status_code,
                provider_code=provider_code,
            )

        try:
            message_id = str(response.json()["data"]["id"])
        except (ValueError, KeyError, TypeError) as e:
            logger.warning(
                "httpSMS send returned an unexpected body: status=%s request_id=%s",
                response.status_code, request_id,
            )
            raise SmsSendError(
                "httpSMS accepted the request but returned no message id",
                status=response.status_code,
                provider_code="malformed_response",
            ) from e

        logger.info(
            "SMS handed to phone via httpSMS: id=%s request_id=%s encrypted=%s body_chars=%d",
            message_id, request_id, self.encrypts_messages, len(body),
        )
        return message_id

    def send(self, to: str, body: str, *, request_id: str | None = None) -> bool:
        """Best-effort send. Returns True on success, False on failure."""
        try:
            self.send_or_raise(to, body, request_id=request_id)
            return True
        except (ValueError, SmsNotConfiguredError, SmsSendError):
            logger.warning("Best-effort httpSMS send failed", exc_info=True)
            return False


def verify_httpsms_webhook(
    authorization: str | None, *, signing_key: str, audience: str,
) -> None:
    """Reject any webhook not signed by httpSMS with our signing key.

    httpSMS signs each webhook as ``Authorization: Bearer <JWT>`` — HS256 over
    the webhook's signing key, ``iss=api.httpsms.com``, ``aud=<webhook URL>``,
    10-minute expiry. An unsigned request (no header) is rejected outright, as
    is a configuration with no signing key: accepting unauthenticated status
    updates would let anyone mark a text delivered.

    Raises:
        HttpSmsWebhookAuthError: On any missing, malformed, or invalid token.
    """
    if not signing_key:
        raise HttpSmsWebhookAuthError("webhook signing key is not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HttpSmsWebhookAuthError("missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        jwt.decode(
            token,
            signing_key,
            algorithms=["HS256"],
            audience=audience,
            issuer=HTTPSMS_WEBHOOK_ISSUER,
            leeway=HTTPSMS_WEBHOOK_LEEWAY_S,
            options={"require": ["exp", "iss", "aud"]},
        )
    except jwt.PyJWTError as e:
        raise HttpSmsWebhookAuthError(f"invalid webhook token: {e}") from e


@dataclass(frozen=True)
class HttpSmsEvent:
    """The parts of an httpSMS CloudEvent a sender acts on."""

    event_type: str
    message_id: str | None
    request_id: str | None
    error_message: str | None
    is_final: bool


def parse_httpsms_event(payload: dict[str, Any], *, event_type_header: str | None) -> HttpSmsEvent:
    """Extract the routing fields from a webhook body.

    The body is a CloudEvent (``type`` + ``data``). ``message.send.expired``
    names the message ``message_id``; every other message event uses ``id``.
    Expiry is only final when ``is_final`` is set — httpSMS retries first.
    """
    event_type = str(payload.get("type") or event_type_header or "")
    data = payload.get("data")
    if not isinstance(data, dict):
        data = {}
    message_id = data.get("message_id") or data.get("id")
    request_id = data.get("request_id")
    error_message = data.get("error_message")
    return HttpSmsEvent(
        event_type=event_type,
        message_id=str(message_id) if message_id else None,
        request_id=str(request_id) if request_id else None,
        error_message=str(error_message) if error_message else None,
        is_final=bool(data.get("is_final", event_type != HTTPSMS_EVENT_SEND_EXPIRED)),
    )
