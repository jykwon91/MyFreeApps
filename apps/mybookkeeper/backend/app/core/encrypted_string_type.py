"""SQLAlchemy ``TypeDecorator`` that transparently encrypts/decrypts string PII.

Uses the existing Fernet-derived PII key from ``core/security.py:encrypt_pii``
(HKDF info ``"mybookkeeper-pii-encryption"``, distinct from the OAuth-token
key family used by the ``Integration`` model).

Why this lives here rather than on each model:
    - One implementation, reused for ``Inquiry`` (PR 2.1a) and Phase 3
      ``Applicant`` / ``Reference`` / ``VideoCallNote`` columns.
    - Encrypt-on-bind / decrypt-on-result happens inside SQLAlchemy's type
      system, so callers (services, tests, audit) interact with plaintext only.
      This forces consistent treatment everywhere — no hand-rolled
      ``encrypt_pii(...)`` calls in services to forget.
    - ``key_version`` is stored as a sibling ``SmallInteger`` column on each
      PII-bearing table. Today's writes always use the current key (version 1);
      reads round-trip via the same key. Rotation is a future concern (per
      RENTALS_PLAN.md §8.2): a non-destructive background re-encryption worker
      will migrate v1 → v2 once a second key family is introduced.

Tampered ciphertext raises ``cryptography.fernet.InvalidToken`` from
``decrypt_pii`` — surfaced as a clear ``ValueError`` here so callers don't have
to import ``cryptography`` to catch it.
"""
from __future__ import annotations

from cryptography.fernet import InvalidToken
from sqlalchemy import String
from sqlalchemy.types import TypeDecorator

from app.core.security import decrypt_pii, encrypt_pii


class EncryptedString(TypeDecorator):
    """A ``String(N)`` column that encrypts on write and decrypts on read.

    The ``length`` parameter is the **plaintext** size budget — the underlying
    database column is sized large enough to hold the corresponding Fernet
    ciphertext (which expands by ~80 bytes plus base64 overhead). ``Text``
    backing avoids needing per-call length math.
    """

    # Use Text-equivalent storage; ``String`` with no length is portable.
    impl = String
    cache_ok = True

    def __init__(self, length: int | None = None, *args: object, **kwargs: object) -> None:
        # Accept a `length` for documentation / Pydantic validation parity, but
        # always store as unbounded string — Fernet ciphertext is much larger
        # than the plaintext, and bounding the storage column risks truncating
        # legitimate values.
        super().__init__(*args, **kwargs)
        self._plaintext_length = length

    @property
    def python_type(self) -> type[str]:
        return str

    def process_bind_param(self, value: object, dialect: object) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise TypeError(
                f"EncryptedString expected str, got {type(value).__name__}",
            )
        return encrypt_pii(value)

    def process_result_value(self, value: object, dialect: object) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise TypeError(
                f"EncryptedString expected stored str, got {type(value).__name__}",
            )
        try:
            return decrypt_pii(value)
        except InvalidToken as exc:
            raise ValueError(
                "Failed to decrypt EncryptedString column — ciphertext is "
                "corrupted, was encrypted with a different key, or was tampered with.",
            ) from exc
