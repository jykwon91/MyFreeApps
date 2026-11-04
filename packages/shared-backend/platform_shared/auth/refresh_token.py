"""The refresh token a client holds: ``<session id>.<secret>``.

Only a hash of the secret is stored. The secret is random and long, so a plain
SHA-256 is enough: there's nothing to guess that a slow hash would protect.
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


def format_refresh_token(session_id: uuid.UUID, secret: str) -> str:
    return f"{session_id}.{secret}"


def parse_refresh_token(token: str) -> tuple[uuid.UUID, str] | None:
    """Split a token into its session id and secret, or None if it's malformed."""
    session_id, separator, secret = token.partition(".")
    if not separator or not secret:
        return None
    try:
        return uuid.UUID(session_id), secret
    except ValueError:
        return None


__all__ = [
    "format_refresh_token",
    "generate_refresh_secret",
    "hash_refresh_secret",
    "parse_refresh_token",
    "refresh_secret_matches",
]
