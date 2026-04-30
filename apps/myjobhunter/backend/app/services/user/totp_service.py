"""MJH TOTP orchestration — thin wrapper over :mod:`platform_shared.services.totp_service`.

The pure crypto / OTP helpers live in ``platform_shared`` (M5 of the
shared-backend migration). This module owns the DB-coupled coordinators —
loading the user row, calling the shared crypto, and persisting the result —
the parts that depend on MJH's settings + session factory.

Encryption is handled by the ``EncryptedString`` ``TypeDecorator`` on the
``User.totp_secret`` and ``User.totp_recovery_codes`` columns. Service code
interacts with plaintext only — encryption happens at SQLAlchemy bind time.
"""
import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.services.totp_service import (
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


def get_provisioning_uri(secret: str, email: str) -> str:
    """Build the otpauth:// URI shown in authenticator apps.

    Issuer + label are bound to MJH's configured branding (``TOTP_ISSUER`` /
    ``TOTP_LABEL`` in ``app.core.config``). These strings are part of the
    user's enrolled QR code — once shipped they MUST stay stable, otherwise
    every existing authenticator entry becomes ambiguous.
    """
    return _shared_get_provisioning_uri(secret, email, issuer=settings.totp_issuer)


# ---------------------------------------------------------------------------
# DB-coupled coordinators
# ---------------------------------------------------------------------------

async def setup_totp(user_id: uuid.UUID) -> tuple[str, str, list[str]]:
    """Generate a fresh TOTP enrollment and stash it on the user row."""
    async with unit_of_work() as db:
        user = await user_repo.get_by_id(db, user_id)
        if user is None:
            raise ValueError("User not found")
        secret, uri, recovery = _shared_enroll_totp(
            label=user.email,
            issuer=settings.totp_issuer,
        )
        user.totp_secret = secret
        user.totp_recovery_codes = ",".join(recovery)
        return secret, uri, recovery


async def confirm_totp(user_id: uuid.UUID, code: str) -> bool:
    """Verify the first TOTP code from a freshly-enrolled user. Flip ``totp_enabled`` on success."""
    async with unit_of_work() as db:
        user = await user_repo.get_by_id(db, user_id)
        if user is None or not user.totp_secret:
            return False
        if not verify_code(user.totp_secret, code):
            return False
        user.totp_enabled = True
        return True


async def disable_totp(user_id: uuid.UUID, code: str) -> bool:
    """Disable 2FA after verifying a current TOTP ``code``. Clears all TOTP fields on success."""
    async with unit_of_work() as db:
        user = await user_repo.get_by_id(db, user_id)
        if user is None or not user.totp_enabled or not user.totp_secret:
            return False
        if not verify_code(user.totp_secret, code):
            return False
        user.totp_enabled = False
        user.totp_secret = None
        user.totp_recovery_codes = None
        return True


async def validate_totp_for_login(email: str, code: str) -> tuple[bool, bool]:
    """Validate a TOTP code OR a recovery code for the login flow.

    Returns ``(valid, used_recovery_code)``. A successful recovery-code
    consumption rewrites ``user.totp_recovery_codes`` with the matched code
    removed (or ``None`` if it was the last one).
    """
    async with unit_of_work() as db:
        user = await user_repo.get_by_email(db, email)
        if user is None or not user.totp_enabled or not user.totp_secret:
            return False, False

        if verify_code(user.totp_secret, code):
            return True, False

        if user.totp_recovery_codes:
            valid, remaining = verify_recovery_code(user.totp_recovery_codes, code)
            if valid:
                user.totp_recovery_codes = remaining
                return True, True

        return False, False


async def is_totp_required(email: str) -> bool:
    """Return True if the user with ``email`` has 2FA enabled."""
    async with AsyncSessionLocal() as db:
        return await user_repo.get_totp_enabled(db, email)


async def verify_totp_code(db: AsyncSession, user_id: uuid.UUID, code: str) -> bool:
    """Return True if ``code`` is a valid TOTP or recovery code for the user.

    Used by the account-deletion flow (PR C6) — it accepts either a 6-digit
    RFC 6238 code or an 8-char recovery code. Does NOT consume the recovery
    code on match; the caller is about to delete the user anyway.
    """
    if not code:
        return False

    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None or not user.totp_enabled or not user.totp_secret:
        return False

    if verify_code(user.totp_secret, code):
        return True

    if user.totp_recovery_codes:
        valid, _ = verify_recovery_code(user.totp_recovery_codes, code)
        if valid:
            return True

    return False
