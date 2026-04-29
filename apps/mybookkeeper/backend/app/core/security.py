import base64

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

from platform_shared.core.security import FernetSuite, create_pii_suite

from app.core.config import settings

HKDF_SALT = b"mybookkeeper-v1"
# HKDF info string for the PII key family — distinct from the OAuth-token
# family below so leaking one set of ciphertexts does NOT compromise the
# other. MUST stay byte-identical to what's baked into existing production
# PII columns; changing it would silently make every PII row unreadable.
_MBK_PII_INFO = b"mybookkeeper-pii-encryption"


def _derive_fernet(salt: bytes | None, info: bytes = b"mybookkeeper-token-encryption") -> Fernet:
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        info=info,
    )
    key = hkdf.derive(settings.encryption_key.encode())
    return Fernet(base64.urlsafe_b64encode(key))


_fernet = None
_fernet_legacy = None
_pii_suite: FernetSuite | None = None


def get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = _derive_fernet(HKDF_SALT)
    return _fernet


def _get_legacy_fernet() -> Fernet:
    global _fernet_legacy
    if _fernet_legacy is None:
        _fernet_legacy = _derive_fernet(salt=None)
    return _fernet_legacy


def encrypt_token(token: str) -> str:
    return get_fernet().encrypt(token.encode()).decode()


def decrypt_token(token: str) -> str:
    try:
        return get_fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return _get_legacy_fernet().decrypt(token.encode()).decode()


def _get_pii_suite() -> FernetSuite:
    """Lazily build (and cache) the MBK PII Fernet suite.

    Caching matters here — PII columns are encrypted/decrypted on every
    Inquiry / Applicant read & write. Re-deriving the HKDF key on each call
    would be a measurable perf regression vs. the pre-promotion behaviour.
    """
    global _pii_suite
    if _pii_suite is None:
        _pii_suite = create_pii_suite(
            settings.encryption_key,
            salt=HKDF_SALT,
            info=_MBK_PII_INFO,
        )
    return _pii_suite


def encrypt_pii(value: str) -> str:
    """Encrypt PII with MBK's PII key family.

    Thin wrapper around the shared :class:`FernetSuite` from
    ``platform_shared.core.security``. Same `(str) -> str` signature as
    before — call sites are unchanged.
    """
    return _get_pii_suite().encrypt(value)


def decrypt_pii(ciphertext: str) -> str:
    """Decrypt PII produced by :func:`encrypt_pii`.

    Same `(str) -> str` signature as before — call sites are unchanged.
    """
    return _get_pii_suite().decrypt(ciphertext)
