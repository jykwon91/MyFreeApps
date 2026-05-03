"""MJH TOTP orchestration — thin wrapper over :mod:`platform_shared.services.totp_service`.

The pure crypto / OTP helpers live in ``platform_shared`` (M5 of the
shared-backend migration). This module owns the DB-coupled coordinators —
loading the user row, calling the shared crypto, and persisting the result —
the parts that depend on MJH's settings + session factory.

Encryption is handled by the ``EncryptedString`` ``TypeDecorator`` on the
``User.totp_secret`` and ``User.totp_recovery_codes`` columns. Service code
interacts with plaintext only — encryption happens at SQLAlchemy bind time.

Algorithm handling (audit 2026-05-02):
    All new enrollments use SHA-256. ``setup_totp`` writes
    ``users.totp_algorithm = "sha256"`` for the new secret. ``confirm_totp``,
    ``disable_totp``, and ``validate_totp_for_login`` read the column to
    select the correct HMAC digest. Grandfathered users with
    ``totp_algorithm = "sha1"`` continue to work transparently.
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
    """Build the otpauth:// URI shown in authenticator apps.

    Issuer + label are bound to MJH's configured branding (``TOTP_ISSUER`` /
    ``TOTP_LABEL`` in ``app.core.config``). These strings are part of the
    user's enrolled QR code — once shipped they MUST stay stable, otherwise
    every existing authenticator entry becomes ambiguous.
    """
    return _shared_get_provisioning_uri(
        secret, email, issuer=settings.totp_issuer, algorithm=algorithm
    )


# ---------------------------------------------------------------------------
# DB-coupled coordinators
# ---------------------------------------------------------------------------

async def setup_totp(user_id: uuid.UUID) -> tuple[str, str, list[str]]:
    """Generate a fresh SHA-256 TOTP enrollment and stash it on the user row.

    Writes ``users.totp_algorithm = "sha256"`` alongside the new secret so
    subsequent verifications use the correct HMAC digest.
    """
    async with unit_of_work() as db:
        user = await user_repo.get_by_id(db, user_id)
        if user is None:
            raise ValueError("User not found")
        secret, uri, recovery = _shared_enroll_totp(
            label=user.email,
            issuer=settings.totp_issuer,
            algorithm=DEFAULT_TOTP_ALGORITHM,
        )
        user.totp_secret = secret
        user.totp_recovery_codes = ",".join(recovery)
        user.totp_algorithm = DEFAULT_TOTP_ALGORITHM
        return secret, uri, recovery


async def confirm_totp(user_id: uuid.UUID, code: str) -> bool:
    """Verify the first TOTP code from a freshly-enrolled user.

    Flips ``totp_enabled`` on success. Uses ``user.totp_algorithm`` so
    grandfathered SHA-1 users can still confirm during their grace period.
    """
    async with unit_of_work() as db:
        user = await user_repo.get_by_id(db, user_id)
        if user is None or not user.totp_secret:
            return False
        algorithm: TotpAlgorithm = user.totp_algorithm  # type: ignore[assignment]
        if not verify_code(user.totp_secret, code, algorithm=algorithm):
            return False
        user.totp_enabled = True
        return True


async def disable_totp(user_id: uuid.UUID, code: str) -> bool:
    """Disable 2FA after verifying a current TOTP ``code``.

    Clears ``totp_secret``, ``totp_recovery_codes``, and resets
    ``totp_algorithm`` to ``"sha1"`` (the migration server_default) so the
    next re-enrollment starts clean. ``setup_totp`` will overwrite to
    ``"sha256"`` on the next enrollment.
    """
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
    """Validate a TOTP code OR a recovery code for the login flow.

    Returns ``(valid, used_recovery_code)``. A successful recovery-code
    consumption rewrites ``user.totp_recovery_codes`` with the matched code
    removed (or ``None`` if it was the last one).

    Uses ``user.totp_algorithm`` to drive HMAC verification so both SHA-1
    grandfathered users and new SHA-256 users are handled correctly.
    """
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

    algorithm: TotpAlgorithm = user.totp_algorithm  # type: ignore[assignment]
    if verify_code(user.totp_secret, code, algorithm=algorithm):
        return True

    if user.totp_recovery_codes:
        valid, _ = verify_recovery_code(user.totp_recovery_codes, code)
        if valid:
            return True

    return False
