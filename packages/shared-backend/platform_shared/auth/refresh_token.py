"""The refresh token a client holds: ``<session id>.<secret>.<signature>``.

Only a hash of the secret is stored. The secret is random and long, so a plain
SHA-256 is enough: there's nothing to guess that a slow hash would protect.

The signature shows the server issued this token for this session. That's how an
old token is told apart from a guess without keeping every old secret, and why
knowing a session id isn't enough to end that session.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid

_SECRET_BYTES = 32


def generate_refresh_secret() -> str:
    return secrets.token_urlsafe(_SECRET_BYTES)


def hash_refresh_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def refresh_secret_matches(secret: str, stored_hash: str | None) -> bool:
    return stored_hash is not None and hmac.compare_digest(
        hash_refresh_secret(secret), stored_hash,
    )


def _signature(session_id: uuid.UUID, secret: str, signing_key: str) -> str:
    message = f"refresh-session.{session_id}.{secret}".encode()
    return hmac.new(signing_key.encode(), message, hashlib.sha256).hexdigest()


def format_refresh_token(session_id: uuid.UUID, secret: str, signing_key: str) -> str:
    return f"{session_id}.{secret}.{_signature(session_id, secret, signing_key)}"


def parse_refresh_token(token: str, signing_key: str) -> tuple[uuid.UUID, str] | None:
    """The session id and secret of a token this server issued, otherwise None."""
    parts = token.split(".")
    if len(parts) != 3:
        return None
    raw_session_id, secret, signature = parts
    try:
        session_id = uuid.UUID(raw_session_id)
        expected = _signature(session_id, secret, signing_key)
        # One spelling per token, so a token is a stable thing to rate limit or log.
        if str(session_id) != raw_session_id:
            return None
        if not hmac.compare_digest(signature.encode(), expected.encode()):
            return None
    except (ValueError, UnicodeError):
        return None
    return session_id, secret


__all__ = [
    "format_refresh_token",
    "generate_refresh_secret",
    "hash_refresh_secret",
    "parse_refresh_token",
    "refresh_secret_matches",
]
