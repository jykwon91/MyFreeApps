"""SQLAlchemy ``TypeDecorator`` that transparently encrypts/decrypts string PII.

Thin MBK-specific wrapper around
:class:`platform_shared.core.encrypted_string_type.EncryptedString` — bakes in
MBK's PII codec (``encrypt_pii`` / ``decrypt_pii`` from ``app.core.security``)
so column declarations stay clean::

    inquirer_email: Mapped[str | None] = mapped_column(EncryptedString(255), nullable=True)

…with no per-column codec plumbing.

Why this lives here rather than on each model:
    - One implementation, reused for ``Inquiry`` (PR 2.1a), Phase 3
      ``Applicant`` / ``Reference`` / ``VideoCallNote`` columns, and any
      future PII-bearing tables.
    - Encrypt-on-bind / decrypt-on-result happens inside SQLAlchemy's type
      system, so callers (services, tests, audit) interact with plaintext only.
      This forces consistent treatment everywhere — no hand-rolled
      ``encrypt_pii(...)`` calls in services to forget.
    - ``key_version`` is stored as a sibling ``SmallInteger`` column on each
      PII-bearing table. Today's writes always use the current key (version 1);
      reads round-trip via the same key. Rotation is a future concern (per
      RENTALS_PLAN.md §8.2): a non-destructive background re-encryption worker
      will migrate v1 → v2 once a second key family is introduced.

Tampered ciphertext raises ``cryptography.fernet.InvalidToken`` from the
underlying Fernet library — surfaced as a clear ``ValueError`` by the shared
TypeDecorator so callers don't have to import ``cryptography`` to catch it.
"""
from __future__ import annotations

from platform_shared.core.encrypted_string_type import (
    EncryptedString as _SharedEncryptedString,
    PIICodec,
)

from app.core.security import decrypt_pii, encrypt_pii

# MBK's PII codec — closes over MBK settings via the wrappers in
# ``app.core.security``. Constructed once at module import.
_MBK_PII_CODEC = PIICodec(encrypt=encrypt_pii, decrypt=decrypt_pii)


class EncryptedString(_SharedEncryptedString):
    """MBK-specific :class:`EncryptedString` with the PII codec baked in.

    Existing call sites use ``mapped_column(EncryptedString(255), ...)`` with
    no codec arg — that continues to work because ``_codec`` is set at the
    class level here.
    """

    # SQLAlchemy reads ``cache_ok`` per-class (it warns when a subclass of a
    # ``TypeDecorator`` doesn't explicitly opt in, even if the parent did).
    # Re-asserting it here avoids the warning and confirms intent: this type's
    # cache key is fully determined by ``length`` (the codec is class-level
    # state, identical across instances).
    cache_ok = True

    _codec = _MBK_PII_CODEC
