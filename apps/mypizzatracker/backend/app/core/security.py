"""MyPizzaTracker encryption helpers.

Two key families derived from a single ``encryption_key`` master via HKDF:

1. **PII** — ``salt=b"mypizzatracker-v1"``,
   ``info=b"mypizzatracker-pii-encryption"``. Used by the
   ``EncryptedString`` ``TypeDecorator`` for column-level PII encryption
   (TOTP secrets, recovery codes).

The ``info`` constants must NEVER change once shipped — every existing
encrypted value is bound to the byte-identical info string used at write time.

Mirrors apps/myjobhunter/backend/app/core/security.py (name swap only).
"""
from platform_shared.core.security import FernetSuite, create_pii_suite

from app.core.config import settings

_PII_SALT = b"mypizzatracker-v1"
_PII_INFO = b"mypizzatracker-pii-encryption"


_pii_suite: FernetSuite | None = None


def _get_pii_suite() -> FernetSuite:
    global _pii_suite
    if _pii_suite is None:
        _pii_suite = create_pii_suite(
            settings.encryption_key,
            salt=_PII_SALT,
            info=_PII_INFO,
        )
    return _pii_suite


def encrypt_pii(value: str | None) -> str | None:
    """Encrypt PII with the app's PII key family."""
    if value is None:
        return None
    return _get_pii_suite().encrypt(value)


def decrypt_pii(ciphertext: str | None) -> str | None:
    """Decrypt PII produced by :func:`encrypt_pii`."""
    if ciphertext is None:
        return None
    return _get_pii_suite().decrypt(ciphertext)
