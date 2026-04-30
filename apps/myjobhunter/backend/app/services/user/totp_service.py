"""MJH TOTP verification for security-critical re-auth flows.

C5 will build the full enrollment / login flow; for now this module exposes
just the verifier that the account-deletion endpoint needs. It accepts
either a 6-digit RFC 6238 code OR an 8-char recovery code, mirroring MBK's
``validate_totp_for_login`` semantics.

The MJH user model stores:
  * ``totp_secret_encrypted`` — Fernet-encrypted base32 secret, sealed with
    the per-user key derived from ``settings.encryption_key`` (same scheme
    as MBK; see ``platform_shared.services.totp_service.encrypt_for_user``)
  * ``totp_recovery_codes`` — Fernet-encrypted comma-separated list of
    8-char hex codes (same per-user key)

Both columns are encrypted at the application layer (not via the M2
``EncryptedString`` TypeDecorator) because the existing column types are
``String(...)`` rather than the ``LargeBinary`` the TypeDecorator expects.
This is consistent with MBK's pre-PII pattern and is fine for the current
key version — when MJH gets PII columns, they should adopt the
TypeDecorator and live alongside this code.
"""
import uuid
from typing import Optional

from cryptography.fernet import InvalidToken
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.services.totp_service import (
    decrypt_for_user,
    verify_code,
    verify_recovery_code,
)

from app.core.config import settings
from app.models.user.user import User


def _decrypt_secret(encrypted: str, user_id: uuid.UUID) -> Optional[str]:
    """Decrypt a Fernet-sealed value for ``user_id``. Returns None on key mismatch."""
    try:
        return decrypt_for_user(encrypted, settings.encryption_key, user_id)
    except InvalidToken:
        return None


async def verify_totp_code(db: AsyncSession, user_id: uuid.UUID, code: str) -> bool:
    """Return True if ``code`` is a valid current TOTP or recovery code for the user.

    Recovery codes are matched against the encrypted column; a successful
    match here does NOT consume the code (the caller — account deletion —
    is about to delete the user anyway, so consumption is moot). For
    flows that need consume-on-use semantics (login, MBK pattern), this
    helper is the wrong building block — write a separate one that
    persists the decremented codes list.
    """
    if not code:
        return False

    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None or not user.totp_enabled or not user.totp_secret_encrypted:
        return False

    secret = _decrypt_secret(user.totp_secret_encrypted, user.id)
    if secret is not None and verify_code(secret, code):
        return True

    if user.totp_recovery_codes:
        recovery_str = _decrypt_secret(user.totp_recovery_codes, user.id)
        if recovery_str is not None:
            valid, _ = verify_recovery_code(recovery_str, code)
            if valid:
                return True

    return False
