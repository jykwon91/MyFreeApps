"""SQLAlchemy ``TypeDecorator`` that transparently encrypts/decrypts string PII.

Thin MJH-specific wrapper around
:class:`platform_shared.core.encrypted_string_type.EncryptedString` — bakes in
MJH's PII codec so column declarations stay clean::

    totp_secret: Mapped[str | None] = mapped_column(EncryptedString(255), nullable=True)

…with no per-column codec plumbing.

Why this lives here rather than on each model:
    - One implementation, reused for ``User.totp_secret`` and any future
      PII-bearing tables (e.g. profile address fields if they're ever added).
    - Encrypt-on-bind / decrypt-on-result happens inside SQLAlchemy's type
      system, so callers (services, tests, audit) interact with plaintext only.
    - Cross-app key isolation is automatic — MJH's PII codec uses
      ``info=b"myjobhunter-pii-encryption"``, so MJH ciphertexts cannot be
      decrypted with MBK's key family even when the master ``encryption_key``
      happens to match.

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

# MJH's PII codec — closes over MJH settings via the wrappers in
# ``app.core.security``. Constructed once at module import.
_MJH_PII_CODEC = PIICodec(encrypt=encrypt_pii, decrypt=decrypt_pii)


class EncryptedString(_SharedEncryptedString):
    """MJH-specific :class:`EncryptedString` with the PII codec baked in.

    Call sites use ``mapped_column(EncryptedString(255), ...)`` with no codec
    arg — the class-level ``_codec`` attribute is what binds the encryption
    key family to MJH's PII info string.
    """

    # SQLAlchemy reads ``cache_ok`` per-class (it warns when a subclass of a
    # ``TypeDecorator`` doesn't explicitly opt in, even if the parent did).
    # Re-asserting it here avoids the warning and confirms intent: this type's
    # cache key is fully determined by ``length`` (the codec is class-level
    # state, identical across instances).
    cache_ok = True

    _codec = _MJH_PII_CODEC
