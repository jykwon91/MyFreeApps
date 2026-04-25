import base64
import hashlib
import secrets
import uuid

import pyotp
from cryptography.fernet import Fernet

from app.core.config import settings
from app.db.session import AsyncSessionLocal, unit_of_work
from app.repositories import user_repo


def _fernet(user_id: uuid.UUID) -> Fernet:
    key = hashlib.sha256(
        settings.encryption_key.encode() + str(user_id).encode(),
    ).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def _encrypt(value: str, user_id: uuid.UUID) -> str:
    return _fernet(user_id).encrypt(value.encode()).decode()


def _decrypt(value: str, user_id: uuid.UUID) -> str:
    return _fernet(user_id).decrypt(value.encode()).decode()


def generate_secret() -> str:
    return pyotp.random_base32()


def get_provisioning_uri(secret: str, email: str) -> str:
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name="MyBookkeeper")


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


async def setup_totp(user_id: uuid.UUID) -> tuple[str, str]:
    async with unit_of_work() as db:
        user = await user_repo.get_by_id(db, user_id)
        if user is None:
            raise ValueError("User not found")
        secret = generate_secret()
        user.totp_secret = _encrypt(secret, user_id)
        uri = get_provisioning_uri(secret, user.email)
        return secret, uri


async def confirm_totp(user_id: uuid.UUID, code: str) -> tuple[bool, list[str]]:
    async with unit_of_work() as db:
        user = await user_repo.get_by_id(db, user_id)
        if user is None or not user.totp_secret:
            return False, []
        secret = _decrypt(user.totp_secret, user_id)
        if not verify_code(secret, code):
            return False, []
        recovery = generate_recovery_codes()
        user.totp_enabled = True
        user.totp_recovery_codes = _encrypt(",".join(recovery), user_id)
        return True, recovery


async def disable_totp(user_id: uuid.UUID, code: str) -> bool:
    async with unit_of_work() as db:
        user = await user_repo.get_by_id(db, user_id)
        if user is None or not user.totp_enabled or not user.totp_secret:
            return False
        secret = _decrypt(user.totp_secret, user_id)
        if not verify_code(secret, code):
            return False
        user.totp_enabled = False
        user.totp_secret = None
        user.totp_recovery_codes = None
        return True


async def validate_totp_for_login(email: str, code: str) -> tuple[bool, bool]:
    """Validate a TOTP or recovery code.

    Returns (valid, used_recovery_code).
    """
    async with unit_of_work() as db:
        user = await user_repo.get_by_email(db, email)
        if user is None or not user.totp_enabled or not user.totp_secret:
            return False, False

        secret = _decrypt(user.totp_secret, user.id)
        if verify_code(secret, code):
            return True, False

        if user.totp_recovery_codes:
            recovery_str = _decrypt(user.totp_recovery_codes, user.id)
            valid, remaining = verify_recovery_code(recovery_str, code)
            if valid:
                user.totp_recovery_codes = _encrypt(remaining, user.id) if remaining else None
                return True, True

        return False, False


async def is_totp_required(email: str) -> bool:
    async with AsyncSessionLocal() as db:
        return await user_repo.get_totp_enabled(db, email)
