"""SQLAlchemy ``TypeDecorator`` that transparently encrypts/decrypts string PII.

MGA-specific wrapper around
:class:`platform_shared.core.encrypted_string_type.EncryptedString`.
Bakes in MGA's PII codec so column declarations stay clean:

    totp_secret: Mapped[str | None] = mapped_column(EncryptedString(255), nullable=True)

Cross-app key isolation is automatic — MGA's PII codec uses
``info=b"mygamingassistant-pii-encryption"``, isolating ciphertexts from
MBK and MJH even when the master ``encryption_key`` happens to match.

Mirrors apps/myjobhunter/backend/app/core/encrypted_string_type.py.
"""
from __future__ import annotations

from platform_shared.core.encrypted_string_type import (
    EncryptedString as _SharedEncryptedString,
    PIICodec,
)

from app.core.security import decrypt_pii, encrypt_pii

_MGA_PII_CODEC = PIICodec(encrypt=encrypt_pii, decrypt=decrypt_pii)


class EncryptedString(_SharedEncryptedString):
    """MGA-specific :class:`EncryptedString` with the PII codec baked in."""

    cache_ok = True
    _codec = _MGA_PII_CODEC
