import base64

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

from app.core.config import settings

HKDF_SALT = b"mybookkeeper-v1"


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
_fernet_pii = None


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


def _get_pii_fernet() -> Fernet:
    global _fernet_pii
    if _fernet_pii is None:
        _fernet_pii = _derive_fernet(HKDF_SALT, info=b"mybookkeeper-pii-encryption")
    return _fernet_pii


def encrypt_token(token: str) -> str:
    return get_fernet().encrypt(token.encode()).decode()


def decrypt_token(token: str) -> str:
    try:
        return get_fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return _get_legacy_fernet().decrypt(token.encode()).decode()


def encrypt_pii(value: str) -> str:
    return _get_pii_fernet().encrypt(value.encode()).decode()


def decrypt_pii(ciphertext: str) -> str:
    return _get_pii_fernet().decrypt(ciphertext.encode()).decode()
