"""MyJobHunter encryption helpers.

Two key families derived from a single ``encryption_key`` master via HKDF:

1. **Job board credentials** — ``salt=b"myjobhunter-v1"``,
   ``info=b"myjobhunter-job-board-credentials"``. Used by
   ``models/integration/job_board_credential.py`` to encrypt OAuth tokens at
   rest. Pre-existing.
2. **PII** — ``salt=b"myjobhunter-v1"``, ``info=b"myjobhunter-pii-encryption"``.
   Used by the ``EncryptedString`` ``TypeDecorator`` (see
   ``app.core.encrypted_string_type``) for column-level PII encryption — TOTP
   secrets, recovery codes, future address fields, etc.

The two ``info`` strings keep the families isolated: leaking job-board
ciphertexts does NOT compromise PII ciphertexts and vice versa, even though
they share the same master ``encryption_key``. Cross-app isolation from MBK
is also automatic — MBK uses ``info=b"mybookkeeper-pii-encryption"``.

Both ``info`` constants must NEVER change once shipped — every existing
encrypted value is bound to the byte-identical info string used at write
time. Changing it silently makes every row unreadable.
"""
from platform_shared.core.security import FernetSuite, create_fernet_suite, create_pii_suite

from app.core.config import settings

# HKDF salt for the credentials family (pre-existing).
_CREDENTIALS_SALT = b"myjobhunter-v1"
_CREDENTIALS_INFO = b"myjobhunter-job-board-credentials"

# HKDF salt + info for the PII family. ``salt`` reuses the credentials salt
# because HKDF salts are not secret — the ``info`` byte string is what keeps
# the two key families separated.
_PII_SALT = b"myjobhunter-v1"
_PII_INFO = b"myjobhunter-pii-encryption"


def get_credential_suite() -> FernetSuite:
    """Return the Fernet suite used to encrypt job board credentials."""
    return create_fernet_suite(
        settings.encryption_key,
        salt=_CREDENTIALS_SALT,
        info=_CREDENTIALS_INFO,
    )


_pii_suite: FernetSuite | None = None


def _get_pii_suite() -> FernetSuite:
    """Lazily build (and cache) the MJH PII Fernet suite.

    Caching matters here — PII columns are encrypted/decrypted on every read
    and write. Re-deriving the HKDF key on each call would be a measurable
    perf regression on hot paths (TOTP login validation runs on every login).
    """
    global _pii_suite
    if _pii_suite is None:
        _pii_suite = create_pii_suite(
            settings.encryption_key,
            salt=_PII_SALT,
            info=_PII_INFO,
        )
    return _pii_suite


def encrypt_pii(value: str | None) -> str | None:
    """Encrypt PII with MJH's PII key family. ``None`` passes through unchanged."""
    if value is None:
        return None
    return _get_pii_suite().encrypt(value)


def decrypt_pii(ciphertext: str | None) -> str | None:
    """Decrypt PII produced by :func:`encrypt_pii`. ``None`` passes through unchanged.

    Raises :class:`cryptography.fernet.InvalidToken` if the ciphertext was
    encrypted under a different key family or has been tampered with.
    """
    if ciphertext is None:
        return None
    return _get_pii_suite().decrypt(ciphertext)
