import uuid

from platform_shared.services.totp_service import (
    generate_secret,
    get_provisioning_uri as _get_provisioning_uri,
    verify_code,
    generate_recovery_codes,
    verify_recovery_code,
    encrypt_for_user,
    decrypt_for_user,
)

from app.core.config import settings
from app.db.session import AsyncSessionLocal, unit_of_work
from app.repositories import user_repo

ISSUER = "MyBookkeeper"


def _encrypt(value: str, user_id: uuid.UUID) -> str:
    return encrypt_for_user(value, settings.encryption_key, user_id)


def _decrypt(value: str, user_id: uuid.UUID) -> str:
    return decrypt_for_user(value, settings.encryption_key, user_id)


def get_provisioning_uri(secret: str, email: str) -> str:
    return _get_provisioning_uri(secret, email, issuer=ISSUER)


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


async def validate_totp_for_login(email: str, code: str) -> bool:
    async with unit_of_work() as db:
        user = await user_repo.get_by_email(db, email)
        if user is None or not user.totp_enabled or not user.totp_secret:
            return False

        secret = _decrypt(user.totp_secret, user.id)
        if verify_code(secret, code):
            return True

        if user.totp_recovery_codes:
            recovery_str = _decrypt(user.totp_recovery_codes, user.id)
            valid, remaining = verify_recovery_code(recovery_str, code)
            if valid:
                user.totp_recovery_codes = _encrypt(remaining, user.id) if remaining else None
                return True

        return False


async def is_totp_required(email: str) -> bool:
    async with AsyncSessionLocal() as db:
        return await user_repo.get_totp_enabled(db, email)
