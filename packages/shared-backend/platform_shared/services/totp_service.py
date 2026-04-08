"""TOTP (2FA) utilities — secret generation, verification, recovery codes.

Pure functions only — no database access. App-level services handle persistence.

Usage:
    secret = generate_secret()
    uri = get_provisioning_uri(secret, "user@example.com", issuer="MyApp")
    is_valid = verify_code(secret, "123456")
"""
import base64
import hashlib
import secrets
import uuid

import pyotp
from cryptography.fernet import Fernet


def generate_secret() -> str:
    return pyotp.random_base32()


def get_provisioning_uri(secret: str, email: str, *, issuer: str) -> str:
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name=issuer)


def verify_code(secret: str, code: str) -> bool:
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


def generate_recovery_codes(count: int = 8) -> list[str]:
    return [secrets.token_hex(4).upper() for _ in range(count)]


def verify_recovery_code(stored_codes_str: str | None, code: str) -> tuple[bool, str | None]:
    if not stored_codes_str:
        return False, None
    codes = stored_codes_str.split(",")
    normalized = code.strip().upper()
    if normalized in codes:
        codes.remove(normalized)
        return True, ",".join(codes) if codes else None
    return False, stored_codes_str


def make_user_fernet(encryption_key: str, user_id: uuid.UUID) -> Fernet:
    """Create a user-specific Fernet cipher for encrypting TOTP secrets."""
    key = hashlib.sha256(
        encryption_key.encode() + str(user_id).encode(),
    ).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_for_user(value: str, encryption_key: str, user_id: uuid.UUID) -> str:
    return make_user_fernet(encryption_key, user_id).encrypt(value.encode()).decode()


def decrypt_for_user(value: str, encryption_key: str, user_id: uuid.UUID) -> str:
    return make_user_fernet(encryption_key, user_id).decrypt(value.encode()).decode()
