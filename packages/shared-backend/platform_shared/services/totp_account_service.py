"""Two-factor operations on a stored user account, shared by every app.

The pure code and crypto helpers are in :mod:`platform_shared.services.totp_service`.
This module loads the user row, calls them, and writes the result. Each app binds
one instance to its user model, issuer and session factory.
"""
import uuid
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.repositories.user_repo import get_by_email, get_by_id
from platform_shared.services.totp_service import (
    DEFAULT_TOTP_ALGORITHM,
    TotpAlgorithm,
    generate_recovery_codes,
    generate_secret,
    get_provisioning_uri,
    verify_code,
    verify_recovery_code,
)

# Written when 2FA is disabled: the column's server default.
_ALGORITHM_WHEN_DISABLED: TotpAlgorithm = "sha1"


def _stored_as_is(value: str, _user_id: uuid.UUID) -> str:
    return value


@dataclass(frozen=True)
class TotpAccountService:
    """``encrypt`` and ``decrypt`` default to no-ops for apps whose columns encrypt
    themselves. MyBookkeeper stores per-user ciphertext and passes its own."""

    user_model: Any
    issuer: str
    unit_of_work_factory: Callable[[], AbstractAsyncContextManager[AsyncSession]]
    encrypt: Callable[[str, uuid.UUID], str] = _stored_as_is
    decrypt: Callable[[str, uuid.UUID], str] = _stored_as_is

    def provisioning_uri(
        self,
        secret: str,
        email: str,
        *,
        algorithm: TotpAlgorithm = DEFAULT_TOTP_ALGORITHM,
    ) -> str:
        return get_provisioning_uri(secret, email, issuer=self.issuer, algorithm=algorithm)

    async def setup_totp(self, user_id: uuid.UUID) -> tuple[str, str]:
        """Store a new secret and return ``(secret, provisioning_uri)``.

        2FA stays off, and no recovery codes exist, until :meth:`confirm_totp`
        proves the authenticator works.
        """
        async with self.unit_of_work_factory() as db:
            user = await get_by_id(db, user_id, user_model=self.user_model)
            if user is None:
                raise ValueError("User not found")
            secret = generate_secret()
            user.totp_secret = self.encrypt(secret, user_id)
            user.totp_recovery_codes = None
            user.totp_algorithm = DEFAULT_TOTP_ALGORITHM
            return secret, self.provisioning_uri(
                secret, user.email, algorithm=DEFAULT_TOTP_ALGORITHM,
            )

    async def confirm_totp(self, user_id: uuid.UUID, code: str) -> tuple[bool, list[str]]:
        """Turn 2FA on if ``code`` is right. Returns ``(verified, recovery_codes)``."""
        async with self.unit_of_work_factory() as db:
            user = await get_by_id(db, user_id, user_model=self.user_model)
            if user is None or not user.totp_secret:
                return False, []
            if not self._code_matches(user, code):
                return False, []
            recovery = generate_recovery_codes()
            user.totp_enabled = True
            user.totp_recovery_codes = self.encrypt(",".join(recovery), user_id)
            return True, recovery

    async def disable_totp(self, user_id: uuid.UUID, code: str) -> bool:
        """Turn 2FA off if ``code`` is right."""
        async with self.unit_of_work_factory() as db:
            user = await get_by_id(db, user_id, user_model=self.user_model)
            if user is None or not user.totp_enabled or not user.totp_secret:
                return False
            if not self._code_matches(user, code):
                return False
            user.totp_enabled = False
            user.totp_secret = None
            user.totp_recovery_codes = None
            user.totp_algorithm = _ALGORITHM_WHEN_DISABLED
            return True

    async def validate_totp_for_login(self, email: str, code: str) -> tuple[bool, bool]:
        """Check a code at login. Returns ``(valid, used_recovery_code)``.

        A recovery code that matches is removed.
        """
        async with self.unit_of_work_factory() as db:
            user = await get_by_email(db, email, user_model=self.user_model)
            if user is None or not user.totp_enabled or not user.totp_secret:
                return False, False
            if self._code_matches(user, code):
                return True, False
            if user.totp_recovery_codes:
                stored = self.decrypt(user.totp_recovery_codes, user.id)
                valid, remaining = verify_recovery_code(stored, code)
                if valid:
                    user.totp_recovery_codes = (
                        self.encrypt(remaining, user.id) if remaining else None
                    )
                    return True, True
            return False, False

    async def verify_totp_code(self, db: AsyncSession, user_id: uuid.UUID, code: str) -> bool:
        """Check a code or recovery code for account deletion and the superuser gate."""
        if not code:
            return False
        user = await get_by_id(db, user_id, user_model=self.user_model)
        if user is None or not user.totp_enabled or not user.totp_secret:
            return False
        if self._code_matches(user, code):
            return True
        if user.totp_recovery_codes:
            stored = self.decrypt(user.totp_recovery_codes, user_id)
            valid, _ = verify_recovery_code(stored, code)
            return valid
        return False

    def _code_matches(self, user: Any, code: str) -> bool:
        secret = self.decrypt(user.totp_secret, user.id)
        return verify_code(secret, code, algorithm=user.totp_algorithm)
