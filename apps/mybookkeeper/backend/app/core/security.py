import base64
import hmac

from cryptography.fernet import Fernet, InvalidToken

from platform_shared.core.blind_index import blind_index
from platform_shared.core.security import FernetSuite, create_pii_suite, derive_key

from app.core.config import settings

HKDF_SALT = b"mybookkeeper-v1"
# HKDF info string for the PII key family — distinct from the OAuth-token
# family below so leaking one set of ciphertexts does NOT compromise the
# other. MUST stay byte-identical to what's baked into existing production
# PII columns; changing it would silently make every PII row unreadable.
_MBK_PII_INFO = b"mybookkeeper-pii-encryption"
# Key family for phone-number lookup codes (``rent_reminder_sends.
# recipient_phone_hash``). Changing it, or ENCRYPTION_KEY, makes every stored
# code stop matching: tenants' replies then go unforwarded (never misrouted)
# until each tenant's next reminder text stores a fresh one.
_MBK_PHONE_LOOKUP_INFO = b"mybookkeeper-phone-lookup-v1"


def _derive_fernet(salt: bytes | None, info: bytes = b"mybookkeeper-token-encryption") -> Fernet:
    key = derive_key(settings.encryption_key, salt=salt, info=info)
    return Fernet(base64.urlsafe_b64encode(key))


_fernet: Fernet | None = None
_fernet_legacy: Fernet | None = None
_pii_suite: FernetSuite | None = None
_phone_lookup_key: bytes | None = None


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


def phone_lookup_hash(e164: str) -> str:
    """The keyed one-way code for a phone number, given exactly as E.164.

    Stored beside each reminder text so a tenant's reply can be matched to the
    texts sent to its number without decrypting anyone's phone number. Callers
    must pass the E.164 form, or the same number gives different codes.
    """
    global _phone_lookup_key
    if _phone_lookup_key is None:
        _phone_lookup_key = derive_key(
            settings.encryption_key, salt=HKDF_SALT, info=_MBK_PHONE_LOOKUP_INFO,
        )
    return blind_index(_phone_lookup_key, e164)


def admin_api_key_matches(provided: str, configured: str) -> bool:
    """Constant-time comparison of the static admin API key.

    Both sides are encoded to bytes so ``hmac.compare_digest`` accepts
    non-ASCII header values instead of raising ``TypeError``.
    """
    return hmac.compare_digest(provided.encode(), configured.encode())
