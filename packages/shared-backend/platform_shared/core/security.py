"""Fernet encryption with HKDF key derivation.

Usage:
    suite = create_fernet_suite("my-secret-key", salt=b"myapp-v1", info=b"myapp-token-encryption")
    encrypted = suite.encrypt("secret-value")
    decrypted = suite.decrypt(encrypted)
"""
import base64
from dataclasses import dataclass
from typing import Callable

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes


def _derive_fernet(encryption_key: str, salt: bytes | None, info: bytes) -> Fernet:
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        info=info,
    )
    key = hkdf.derive(encryption_key.encode())
    return Fernet(base64.urlsafe_b64encode(key))


@dataclass(frozen=True)
class FernetSuite:
    """A configured encryption/decryption pair."""
    _fernet: Fernet
    _legacy_fernet: Fernet | None

    def encrypt(self, value: str) -> str:
        return self._fernet.encrypt(value.encode()).decode()

    def decrypt(self, value: str) -> str:
        try:
            return self._fernet.decrypt(value.encode()).decode()
        except InvalidToken:
            if self._legacy_fernet is not None:
                return self._legacy_fernet.decrypt(value.encode()).decode()
            raise


def create_fernet_suite(
    encryption_key: str,
    *,
    salt: bytes,
    info: bytes,
    legacy_salt: bytes | None = None,
    legacy_info: bytes | None = None,
) -> FernetSuite:
    """Create a Fernet encryption suite with optional legacy fallback.

    Args:
        encryption_key: The base encryption key (from settings).
        salt: HKDF salt for key derivation.
        info: HKDF info for key derivation.
        legacy_salt: Optional salt for decrypting old tokens (migration support).
        legacy_info: Optional info for decrypting old tokens.
    """
    fernet = _derive_fernet(encryption_key, salt, info)
    legacy_fernet = None
    if legacy_salt is not None or legacy_info is not None:
        legacy_fernet = _derive_fernet(
            encryption_key,
            legacy_salt,
            legacy_info or info,
        )
    return FernetSuite(_fernet=fernet, _legacy_fernet=legacy_fernet)


def create_pii_suite(
    encryption_key: str,
    *,
    salt: bytes,
    info: bytes,
) -> FernetSuite:
    """Create a separate Fernet suite for PII encryption."""
    fernet = _derive_fernet(encryption_key, salt, info)
    return FernetSuite(_fernet=fernet, _legacy_fernet=None)
