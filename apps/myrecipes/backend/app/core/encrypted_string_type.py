"""SQLAlchemy ``TypeDecorator`` that transparently encrypts/decrypts string PII.

App-specific wrapper around
:class:`platform_shared.core.encrypted_string_type.EncryptedString`.
Bakes in the app's PII codec so column declarations stay clean:

    totp_secret: Mapped[str | None] = mapped_column(EncryptedString(255), nullable=True)

Cross-app key isolation is automatic -- the PII codec uses
``info=b"myrecipes-pii-encryption"``, isolating ciphertexts from
other MyFreeApps even when the master ``encryption_key`` happens to match.
"""
from __future__ import annotations

from platform_shared.core.encrypted_string_type import (
    EncryptedString as _SharedEncryptedString,
    PIICodec,
)

from app.core.security import decrypt_pii, encrypt_pii

_APP_PII_CODEC = PIICodec(encrypt=encrypt_pii, decrypt=decrypt_pii)


class EncryptedString(_SharedEncryptedString):
    """App-specific :class:`EncryptedString` with the PII codec baked in."""

    cache_ok = True
    _codec = _APP_PII_CODEC
