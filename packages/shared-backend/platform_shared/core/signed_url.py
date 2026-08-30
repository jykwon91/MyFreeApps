"""Short-lived HMAC tokens that authorise one server-side fetch target.

The problem this exists for: a server-side proxy (thumbnails, previews,
anything the browser must load through us rather than direct) needs a target
URL as a query parameter. If the endpoint accepts *any* URL, it is an open
proxy — anyone on the internet can launder traffic through the app's IP and
burn its bandwidth. Requiring a bearer token instead does not work either,
because the browser sends no ``Authorization`` header on an ``<img src>``.

The fix is to authorise the *target*, not the caller: the app signs each URL
it emits, and the proxy fetches only URLs carrying a valid, unexpired
signature. An attacker can replay a URL the app already published (harmless —
they could fetch it directly) but cannot mint a token for a target of their
choosing.

This is authorisation, not confidentiality: the URL stays readable in the
query string. Pair it with :mod:`platform_shared.core.url_safety`, which is
what stops the *signed* target from being an internal address — the two guard
different halves of the same request and neither substitutes for the other.

Tokens are ``<expiry>.<base64url-hmac>``: URL-safe, no padding, no storage.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import time

__all__ = ["SignatureError", "sign_payload", "verify_payload"]


class SignatureError(ValueError):
    """The token is missing, malformed, expired, or does not match.

    One error type for every failure mode on purpose: telling a caller
    *which* check failed hands an attacker an oracle, and no legitimate
    caller needs the distinction. Subclasses ``ValueError`` so existing
    handlers map it to a 4xx without new wiring.
    """


def _digest(payload: str, expires_at: int, secret: str) -> str:
    # The expiry is inside the signed material, so it cannot be edited
    # without invalidating the token.
    message = f"{expires_at}:{payload}".encode()
    mac = hmac.new(secret.encode(), message, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode().rstrip("=")


def sign_payload(payload: str, *, secret: str, ttl_seconds: int) -> str:
    """Return a token authorising ``payload`` for the next ``ttl_seconds``.

    Args:
        payload: The exact string the verifier will re-present — typically
            the target URL. Sign what you verify, byte for byte.
        secret: Signing key. Use the app's ``SECRET_KEY``.
        ttl_seconds: Lifetime. Keep it short; a leaked token is valid until
            it expires, and there is no revocation list.

    Raises:
        ValueError: empty secret. Signing with "" would produce tokens any
            other deployment could forge, so it fails loudly rather than
            silently degrading to no security at all.
    """
    if not secret:
        raise ValueError("signing secret must not be empty")
    if ttl_seconds <= 0:
        raise ValueError("ttl_seconds must be positive")

    expires_at = int(time.time()) + ttl_seconds
    return f"{expires_at}.{_digest(payload, expires_at, secret)}"


def verify_payload(payload: str, token: str, *, secret: str) -> None:
    """Raise :class:`SignatureError` unless ``token`` authorises ``payload``.

    Compares with :func:`hmac.compare_digest` — a plain ``==`` on the digest
    leaks its content through timing.
    """
    if not secret:
        raise ValueError("signing secret must not be empty")
    if not token:
        raise SignatureError("missing signature")

    expiry_text, _, signature = token.partition(".")
    if not signature:
        raise SignatureError("malformed signature")

    try:
        expires_at = int(expiry_text)
    except ValueError as exc:
        raise SignatureError("malformed signature") from exc

    # Verify the MAC before trusting the expiry: until the MAC checks out the
    # expiry is attacker-controlled input, and rejecting on it first would
    # answer "is this timestamp in the past" for unsigned garbage.
    expected = _digest(payload, expires_at, secret)
    if not hmac.compare_digest(expected, signature):
        raise SignatureError("signature mismatch")

    if expires_at < int(time.time()):
        raise SignatureError("signature expired")
