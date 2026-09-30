"""TOTP orchestration — mirrors MJH's totp_service.py (name swap only).

See apps/myjobhunter/backend/app/services/user/totp_service.py for the
authoritative docstring and design rationale.
"""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.services.totp_service import (
    DEFAULT_TOTP_ALGORITHM,
    TotpAlgorithm,
    enroll_totp as _shared_enroll_totp,
    generate_recovery_codes,
    generate_secret,
    get_provisioning_uri as _shared_get_provisioning_uri,
    verify_code,
    verify_recovery_code,
)

from app.core.config import settings
from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.user.user import User
from app.repositories.user import user_repo

__all__ = [
    "generate_secret",
    "get_provisioning_uri",
    "verify_code",
    "verify_recovery_code",
    "verify_totp_code",
    "generate_recovery_codes",
    "setup_totp",
    "confirm_totp",
    "disable_totp",
    "validate_totp_for_login",
    "is_totp_required",
]


def get_provisioning_uri(
    secret: str,
    email: str,
    *,
    algorithm: TotpAlgorithm = DEFAULT_TOTP_ALGORITHM,
) -> str:
    return _shared_get_provisioning_uri(
        secret, email, issuer=settings.totp_issuer, algorithm=algorithm
    )


async def setup_totp(user_id: uuid.UUID) -> tuple[str, str]:
    """Generate a fresh SHA-256 TOTP enrollment and stash the secret + URI."""
    async with unit_of_work() as db:
        user = await user_repo.get_by_id(db, user_id)
        if user is None:
            raise ValueError(f"User {user_id} not found")
        return _shared_enroll_totp(user, get_provisioning_uri)


async def confirm_totp(
    user_id: uuid.UUID, code: str
) -> tuple[bool, list[str]]:
    """Confirm TOTP enrollment and generate recovery codes."""
    async with unit_of_work() as db:
        user = await user_repo.get_by_id(db, user_id)
        if user is None or not user.totp_secret:
            return False, []
        algorithm: TotpAlgorithm = user.totp_algorithm  # type: ignore[assignment]
        if not verify_code(user.totp_secret, code, algorithm=algorithm):
            return False, []
        codes = generate_recovery_codes()
        user.totp_enabled = True
        user.totp_recovery_codes = ",".join(codes)
        user.totp_algorithm = DEFAULT_TOTP_ALGORITHM
        return True, codes


async def disable_totp(user_id: uuid.UUID, code: str) -> bool:
    """Disable 2FA for a user after verifying their current TOTP code."""
    async with unit_of_work() as db:
        user = await user_repo.get_by_id(db, user_id)
        if user is None or not user.totp_enabled or not user.totp_secret:
            return False
        algorithm: TotpAlgorithm = user.totp_algorithm  # type: ignore[assignment]
        if not verify_code(user.totp_secret, code, algorithm=algorithm):
            return False
        user.totp_enabled = False
        user.totp_secret = None
        user.totp_recovery_codes = None
        user.totp_algorithm = "sha1"
        return True


async def validate_totp_for_login(email: str, code: str) -> tuple[bool, bool]:
    """Validate a TOTP code OR a recovery code for the login flow."""
    async with unit_of_work() as db:
        user = await user_repo.get_by_email(db, email)
        if user is None or not user.totp_enabled or not user.totp_secret:
            return False, False
        algorithm: TotpAlgorithm = user.totp_algorithm  # type: ignore[assignment]
        if verify_code(user.totp_secret, code, algorithm=algorithm):
            return True, False
        if user.totp_recovery_codes:
            valid, remaining = verify_recovery_code(user.totp_recovery_codes, code)
            if valid:
                user.totp_recovery_codes = remaining
                return True, True
        return False, False


async def is_totp_required(email: str) -> bool:
    async with AsyncSessionLocal() as db:
        return await user_repo.get_totp_enabled(db, email)


async def verify_totp_code(db: AsyncSession, user_id: uuid.UUID, code: str) -> bool:
    """Return True if ``code`` is a valid TOTP or recovery code for the user."""
    if not code:
        return False
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None or not user.totp_enabled or not user.totp_secret:
        return False
    algorithm: TotpAlgorithm = user.totp_algorithm  # type: ignore[assignment]
    if verify_code(user.totp_secret, code, algorithm=algorithm):
        return True
    if user.totp_recovery_codes:
        valid, _ = verify_recovery_code(user.totp_recovery_codes, code)
        if valid:
            return True
    return False
