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

Algorithm handling (audit 2026-05-02):
    All new enrollments use SHA-256. ``setup_totp`` writes ``users.totp_algorithm``
    = ``"sha256"`` for the new secret; ``confirm_totp``, ``disable_totp``, and
    ``validate_totp_for_login`` read the column to select the correct HMAC
    digest. Grandfathered users with ``totp_algorithm = "sha1"`` continue to
    work transparently until they re-enroll.
"""
import uuid

from platform_shared.services.totp_service import (
    DEFAULT_TOTP_ALGORITHM,
    TotpAlgorithm,
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


def get_provisioning_uri(
    secret: str,
    email: str,
    *,
    algorithm: TotpAlgorithm = DEFAULT_TOTP_ALGORITHM,
) -> str:
    """MBK-issuer-bound wrapper over the shared provisioning-URI builder.

    Pre-M5 callers passed ``(secret, email)`` and the issuer was hardcoded
    inside the function. Keep that signature so existing call sites and
    tests keep working — the shared helper is what actually builds the
    URI, with ``issuer`` always set to MBK's brand string.

    ``algorithm`` is passed through to embed the correct ``algorithm=``
    parameter in the otpauth URI for authenticator apps that support it.
    """
    return _shared_get_provisioning_uri(secret, email, issuer=_TOTP_ISSUER, algorithm=algorithm)


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
    """Generate a fresh SHA-256 TOTP secret for a user.

    Returns ``(secret, provisioning_uri)``. The plaintext secret is
    encrypted onto ``users.totp_secret`` and ``users.totp_algorithm`` is
    set to ``"sha256"`` for all new enrollments. ``totp_enabled`` stays
    False — the user still has to confirm a code via :func:`confirm_totp`.
    """
    async with unit_of_work() as db:
        user = await user_repo.get_by_id(db, user_id)
        if user is None:
            raise ValueError("User not found")
        secret = generate_secret()
        user.totp_secret = _encrypt(secret, user_id)
        user.totp_algorithm = DEFAULT_TOTP_ALGORITHM
        uri = get_provisioning_uri(secret, user.email, algorithm=DEFAULT_TOTP_ALGORITHM)
        return secret, uri


async def confirm_totp(user_id: uuid.UUID, code: str) -> tuple[bool, list[str]]:
    """Verify a TOTP ``code`` and, on success, enable 2FA + issue recovery codes.

    Returns ``(verified, recovery_codes)``. On failure or unknown user,
    returns ``(False, [])`` and leaves all flags unchanged.

    Uses the algorithm stored in ``user.totp_algorithm`` so grandfathered
    SHA-1 users can still confirm during their grace period.
    """
    async with unit_of_work() as db:
        user = await user_repo.get_by_id(db, user_id)
        if user is None or not user.totp_secret:
            return False, []
        secret = _decrypt(user.totp_secret, user_id)
        algorithm: TotpAlgorithm = user.totp_algorithm  # type: ignore[assignment]
        if not verify_code(secret, code, algorithm=algorithm):
            return False, []
        recovery = generate_recovery_codes()
        user.totp_enabled = True
        user.totp_recovery_codes = _encrypt(",".join(recovery), user_id)
        return True, recovery


async def disable_totp(user_id: uuid.UUID, code: str) -> bool:
    """Disable 2FA after verifying a current TOTP ``code``.

    Clears ``totp_secret``, ``totp_recovery_codes``, and ``totp_algorithm``
    on success. The algorithm column is reset to the default (``"sha1"``,
    the migration server_default) here so that any subsequent re-enrollment
    begins from the column default; the re-enrollment ``setup_totp`` call
    will then overwrite it to ``"sha256"``.
    """
    async with unit_of_work() as db:
        user = await user_repo.get_by_id(db, user_id)
        if user is None or not user.totp_enabled or not user.totp_secret:
            return False
        secret = _decrypt(user.totp_secret, user_id)
        algorithm: TotpAlgorithm = user.totp_algorithm  # type: ignore[assignment]
        if not verify_code(secret, code, algorithm=algorithm):
            return False
        user.totp_enabled = False
        user.totp_secret = None
        user.totp_recovery_codes = None
        # Reset to server_default so the column is defined; setup_totp will
        # overwrite to sha256 on the next enrollment.
        user.totp_algorithm = "sha1"
        return True


async def validate_totp_for_login(email: str, code: str) -> tuple[bool, bool]:
    """Validate a TOTP code OR a recovery code for the login flow.

    Returns ``(valid, used_recovery_code)``. A successful recovery-code
    consumption rewrites the encrypted recovery-codes column with the
    matched code removed (or clears the column entirely if it was the
    last one).

    Uses ``user.totp_algorithm`` to drive the HMAC verification so both
    grandfathered SHA-1 users and new SHA-256 users are handled correctly.
    """
    async with unit_of_work() as db:
        user = await user_repo.get_by_email(db, email)
        if user is None or not user.totp_enabled or not user.totp_secret:
            return False, False

        secret = _decrypt(user.totp_secret, user.id)
        algorithm: TotpAlgorithm = user.totp_algorithm  # type: ignore[assignment]
        if verify_code(secret, code, algorithm=algorithm):
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
