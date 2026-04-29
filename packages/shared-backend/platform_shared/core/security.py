"""Fernet encryption with HKDF key derivation.

Usage:
    suite = create_fernet_suite("my-secret-key", salt=b"myapp-v1", info=b"myapp-token-encryption")
    encrypted = suite.encrypt("secret-value")
    decrypted = suite.decrypt(encrypted)

Per-app PII helpers:
    ciphertext = encrypt_pii(plaintext, secret_key=..., salt=..., info=b"<app>-pii-encryption")
    plaintext  = decrypt_pii(ciphertext, secret_key=..., salt=..., info=b"<app>-pii-encryption")

Each app constructs its own ``info`` (e.g. ``b"mybookkeeper-pii-encryption"``)
so PII key families stay isolated across apps even when they share a secret.
"""
import base64
from dataclasses import dataclass

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


# ---------------------------------------------------------------------------
# Per-app PII helpers
# ---------------------------------------------------------------------------
#
# Apps wrap these with their own ``secret_key`` / ``salt`` / ``info`` constants
# (typically closing over their settings module) so callers in app code stay
# free of cryptography concerns. The shared functions here are pure — they
# take all key material as arguments and have no module-level state.

def encrypt_pii(
    plaintext: str | None,
    *,
    secret_key: str,
    salt: bytes,
    info: bytes,
) -> str | None:
    """Encrypt a PII string with a per-app-keyed Fernet suite.

    ``None`` is returned unchanged so this is safe to call on optional
    columns. The underlying Fernet ciphertext is non-deterministic — equality
    lookups against the encrypted column will NOT match.

    Args:
        plaintext: The value to encrypt, or ``None``.
        secret_key: The base secret (typically ``settings.encryption_key``).
        salt: HKDF salt — must be byte-identical between encrypt and decrypt.
        info: HKDF info, typically ``b"<app>-pii-encryption"`` to keep the
            PII key family isolated from other key families derived from the
            same secret (e.g. OAuth tokens).
    """
    if plaintext is None:
        return None
    fernet = _derive_fernet(secret_key, salt, info)
    return fernet.encrypt(plaintext.encode()).decode()


def decrypt_pii(
    ciphertext: str | None,
    *,
    secret_key: str,
    salt: bytes,
    info: bytes,
) -> str | None:
    """Decrypt a PII ciphertext produced by :func:`encrypt_pii`.

    ``None`` is returned unchanged so this is safe to call on optional
    columns. Raises :class:`cryptography.fernet.InvalidToken` if ``ciphertext``
    was encrypted with a different ``secret_key`` / ``salt`` / ``info``
    combination, or if it has been tampered with.

    Args:
        ciphertext: The Fernet ciphertext to decrypt, or ``None``.
        secret_key: The base secret used at encrypt time.
        salt: The HKDF salt used at encrypt time — must be byte-identical.
        info: The HKDF info used at encrypt time — must be byte-identical.
    """
    if ciphertext is None:
        return None
    fernet = _derive_fernet(secret_key, salt, info)
    return fernet.decrypt(ciphertext.encode()).decode()
