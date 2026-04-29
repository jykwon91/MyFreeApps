"""MBK TOTP orchestration — thin wrapper over :mod:`platform_shared.services.totp_service`.

After PR M5 the pure crypto / OTP helpers live in ``platform_shared`` (see
``packages/shared-backend/platform_shared/services/totp_service.py``). This
module keeps the DB-coupled coordinators that load the user row, encrypt
the secret with MBK's master ``encryption_key``, and persist the result —
the parts that legitimately depend on ``app.core.config``,
``app.db.session``, and ``app.repositories.user_repo``.

The wire format / on-disk format is unchanged from before M5 — production
users keep generating valid codes against the secrets stored on their
``users.totp_secret`` column.

Re-exports preserve the pre-M5 import shape so the ~6 in-app call sites
and the integration tests don't have to change:

    from app.services.user import totp_service
    totp_service.generate_secret()
    totp_service.verify_code(secret, code)
    totp_service._encrypt(value, user_id)        # private alias kept for tests
    totp_service._decrypt(value, user_id)        # private alias kept for tests
    await totp_service.setup_totp(user.id)       # DB coordinator (this module)
"""
import uuid

from platform_shared.services.totp_service import (
    decrypt_for_user,
    encrypt_for_user,
    generate_recovery_codes,
    generate_secret,
    get_provisioning_uri as _shared_get_provisioning_uri,
    verify_code,
    verify_recovery_code,
)

from app.core.config import settings
from app.db.session import AsyncSessionLocal, unit_of_work
from app.repositories import user_repo

# MBK's authenticator brand. Centralised here so every call site in the app
# (setup, login, recovery) uses the same string and we don't ship a mix of
# "MyBookkeeper" / "Mybookkeeper" / "MyBookKeeper" to authenticator apps.
_TOTP_ISSUER = "MyBookkeeper"


# ---------------------------------------------------------------------------
# Re-exports — pure helpers from platform_shared
# ---------------------------------------------------------------------------

# The shared `generate_secret`, `verify_code`, `verify_recovery_code`, and
# `generate_recovery_codes` take no app-specific args, so we re-export them
# verbatim. Aliasing here (rather than a `from … import *`) lets tests
# patch `app.services.user.totp_service.generate_secret` without polluting
# the shared module.
__all__ = [
    "generate_secret",
    "get_provisioning_uri",
    "verify_code",
    "verify_recovery_code",
    "generate_recovery_codes",
    "setup_totp",
    "confirm_totp",
    "disable_totp",
    "validate_totp_for_login",
    "is_totp_required",
]


def get_provisioning_uri(secret: str, email: str) -> str:
    """MBK-issuer-bound wrapper over the shared provisioning-URI builder.

    Pre-M5 callers passed ``(secret, email)`` and the issuer was hardcoded
    inside the function. Keep that signature so existing call sites and
    tests keep working — the shared helper is what actually builds the
    URI, with ``issuer`` always set to MBK's brand string.
    """
    return _shared_get_provisioning_uri(secret, email, issuer=_TOTP_ISSUER)


# ---------------------------------------------------------------------------
# Encryption helpers — bind MBK's master key into the per-user Fernet
# ---------------------------------------------------------------------------

def _encrypt(value: str, user_id: uuid.UUID) -> str:
    """Encrypt ``value`` for ``user_id`` using MBK's configured master key.

    Underscore-prefixed name kept for backwards compatibility with the
    pre-M5 test suite (``test_totp_service.py``, ``test_totp_routes.py``,
    ``test_auth_events_integration.py``) that patches / imports this
    symbol directly. New code should call the shared helper directly.
    """
    return encrypt_for_user(value, settings.encryption_key, user_id)


def _decrypt(value: str, user_id: uuid.UUID) -> str:
    """Decrypt a token produced by :func:`_encrypt`. Raises ``InvalidToken`` on key mismatch."""
    return decrypt_for_user(value, settings.encryption_key, user_id)


# ---------------------------------------------------------------------------
# DB-coupled coordinators
# ---------------------------------------------------------------------------

async def setup_totp(user_id: uuid.UUID) -> tuple[str, str]:
    """Generate a fresh TOTP secret for a user and return ``(secret, provisioning_uri)``.

    The plaintext secret is encrypted onto ``users.totp_secret`` but
    ``totp_enabled`` stays False — the user still has to confirm a code
    via :func:`confirm_totp` before 2FA actually gates their login.
    """
    async with unit_of_work() as db:
        user = await user_repo.get_by_id(db, user_id)
        if user is None:
            raise ValueError("User not found")
        secret = generate_secret()
        user.totp_secret = _encrypt(secret, user_id)
        uri = get_provisioning_uri(secret, user.email)
        return secret, uri


async def confirm_totp(user_id: uuid.UUID, code: str) -> tuple[bool, list[str]]:
    """Verify a TOTP ``code`` and, on success, enable 2FA + issue recovery codes.

    Returns ``(verified, recovery_codes)``. On failure or unknown user,
    returns ``(False, [])`` and leaves all flags unchanged.
    """
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
    """Disable 2FA after verifying a current TOTP ``code``. Clears all TOTP fields on success."""
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
    """Validate a TOTP code OR a recovery code for the login flow.

    Returns ``(valid, used_recovery_code)``. A successful recovery-code
    consumption rewrites the encrypted recovery-codes column with the
    matched code removed (or clears the column entirely if it was the
    last one).
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
                user.totp_recovery_codes = (
                    _encrypt(remaining, user.id) if remaining else None
                )
                return True, True

        return False, False


async def is_totp_required(email: str) -> bool:
    """Return True if the user with ``email`` has 2FA enabled (cheap selectinload)."""
    async with AsyncSessionLocal() as db:
        return await user_repo.get_totp_enabled(db, email)
