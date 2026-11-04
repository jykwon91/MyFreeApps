"""Two-factor operations on a stored user account, shared by every app.

The pure code and crypto helpers are in :mod:`platform_shared.services.totp_service`.
This module loads the user row, calls them, and writes the result. Each app binds
one instance to its user model, issuer and session factory.

A code works once. Every check locks the user row, so two requests with the same
code can't both pass.
"""
import uuid
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.repositories.user_repo import lock_by_email, lock_by_id
from platform_shared.services.totp_service import (
    DEFAULT_TOTP_ALGORITHM,
    TotpAlgorithm,
    generate_recovery_codes,
    generate_secret,
    get_provisioning_uri,
    matching_time_step,
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
            user = await lock_by_id(db, user_id, user_model=self.user_model)
            if user is None:
                raise ValueError("User not found")
            secret = generate_secret()
            user.totp_secret = self.encrypt(secret, user_id)
            user.totp_recovery_codes = None
            user.totp_algorithm = DEFAULT_TOTP_ALGORITHM
            user.totp_last_used_step = None
            return secret, self.provisioning_uri(
                secret, user.email, algorithm=DEFAULT_TOTP_ALGORITHM,
            )

    async def confirm_totp(self, user_id: uuid.UUID, code: str) -> tuple[bool, list[str]]:
        """Turn 2FA on if ``code`` is right. Returns ``(verified, recovery_codes)``."""
        async with self.unit_of_work_factory() as db:
            user = await lock_by_id(db, user_id, user_model=self.user_model)
            if user is None or not user.totp_secret:
                return False, []
            if not self._spend_time_code(user, code):
                return False, []
            recovery = generate_recovery_codes()
            user.totp_enabled = True
            user.totp_recovery_codes = self.encrypt(",".join(recovery), user_id)
            return True, recovery

    async def disable_totp(self, user_id: uuid.UUID, code: str) -> bool:
        """Turn 2FA off if ``code`` is right."""
        async with self.unit_of_work_factory() as db:
            user = await lock_by_id(db, user_id, user_model=self.user_model)
            if user is None or not user.totp_enabled or not user.totp_secret:
                return False
            if not self._spend_time_code(user, code):
                return False
            user.totp_enabled = False
            user.totp_secret = None
            user.totp_recovery_codes = None
            user.totp_algorithm = _ALGORITHM_WHEN_DISABLED
            user.totp_last_used_step = None
            return True

    async def validate_totp_for_login(self, email: str, code: str) -> tuple[bool, bool]:
        """Spend a code or recovery code at login. Returns ``(valid, used_recovery_code)``."""
        async with self.unit_of_work_factory() as db:
            user = await lock_by_email(db, email, user_model=self.user_model)
            if user is None or not user.totp_enabled or not user.totp_secret:
                return False, False
            if self._spend_time_code(user, code):
                return True, False
            used_recovery_code = self._spend_recovery_code(user, code)
            return used_recovery_code, used_recovery_code

    async def verify_totp_code(self, db: AsyncSession, user_id: uuid.UUID, code: str) -> bool:
        """Spend a code or recovery code for account deletion or the superuser gate.

        Commits on the caller's session, so a spent code stays spent if the action
        then fails, and the row lock is gone before the action starts.
        """
        if not code:
            return False
        user = await lock_by_id(db, user_id, user_model=self.user_model)
        valid = (
            user is not None
            and user.totp_enabled
            and bool(user.totp_secret)
            and (self._spend_time_code(user, code) or self._spend_recovery_code(user, code))
        )
        await db.commit()
        return valid

    def _spend_time_code(self, user: Any, code: str) -> bool:
        step = matching_time_step(
            self.decrypt(user.totp_secret, user.id),
            code,
            algorithm=user.totp_algorithm,
            after_step=user.totp_last_used_step,
        )
        if step is None:
            return False
        user.totp_last_used_step = step
        return True

    def _spend_recovery_code(self, user: Any, code: str) -> bool:
        if not user.totp_recovery_codes:
            return False
        stored = self.decrypt(user.totp_recovery_codes, user.id)
        valid, remaining = verify_recovery_code(stored, code)
        if valid:
            user.totp_recovery_codes = self.encrypt(remaining, user.id) if remaining else None
        return valid
