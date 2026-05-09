"""Shared ``DELETE /users/me`` route — three-factor confirm + audit + cascade.

Both MBK and MJH expose this endpoint with byte-identical semantics:
password re-verification + email-match confirmation + TOTP step-up
(when 2FA is enabled). Apps build the router via
:func:`build_account_deletion_router` passing their own auth dependency,
db-session dependency, and TOTP verifier callable. The included router
has no prefix; parent app routers wire under their own root.

The export endpoint (``GET /users/me/export``) is intentionally NOT
shared — its response shape and dependency surface differ per app
(MBK includes per-org context, MJH is single-tenant-per-user) and
extracting it would be more friction than reuse value.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi_users.password import PasswordHelper
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.schemas.account import DeleteAccountRequest
from platform_shared.services.account_deletion import delete_account


def build_account_deletion_router(
    *,
    current_active_user: Callable[..., Awaitable[Any]],
    get_db_dependency: Callable[..., AsyncIterator[AsyncSession]],
    verify_totp_step_up: Callable[
        [AsyncSession, uuid.UUID, str], Awaitable[bool]
    ],
    unit_of_work_factory: Callable[..., Any],
) -> APIRouter:
    """Build a router exposing ``DELETE /users/me``.

    Args:
        current_active_user: The app's fastapi-users
            ``current_active_user`` dependency.
        get_db_dependency: The app's ``get_db`` async-generator
            dependency. Used by the TOTP-verify call inside the
            request gate.
        verify_totp_step_up: A callable matching MJH's / MBK's
            ``verify_totp_code(db, user_id, code) -> bool``. The
            implementation lives per-app (MBK and MJH have a
            byte-identical service-layer function after audit H5).
        unit_of_work_factory: The app's ``unit_of_work`` async context
            manager. The route opens this scope around the
            cascade-delete + audit-event write so they commit
            atomically.

    Returns:
        An ``APIRouter`` with a single DELETE route at ``/users/me``.
        Tagged ``account`` for OpenAPI grouping.
    """
    router = APIRouter(tags=["account"])

    @router.delete("/users/me", status_code=204)
    async def delete_my_account(
        body: DeleteAccountRequest,
        db: AsyncSession = Depends(get_db_dependency),
        current_user: Any = Depends(current_active_user),
    ) -> None:
        """Permanently delete the authenticated user's account and all their data.

        Requires:
        - Correct account password
        - Email address matching the account (typed confirmation)
        - TOTP code if 2FA is enabled
        """
        # Re-verify password to prevent CSRF and accidental deletion.
        helper = PasswordHelper()
        verified, _ = helper.verify_and_update(
            body.password, current_user.hashed_password
        )
        if not verified:
            raise HTTPException(status_code=403, detail="Incorrect password")

        # Email confirmation must exactly match the account email
        # (case-insensitive).
        if body.confirm_email.strip().lower() != current_user.email.lower():
            raise HTTPException(
                status_code=400, detail="Email confirmation does not match"
            )

        # TOTP gate: if the user has 2FA enabled, require a valid code.
        if current_user.totp_enabled:
            if not body.totp_code:
                raise HTTPException(status_code=400, detail="TOTP_CODE_REQUIRED")
            if not await verify_totp_step_up(db, current_user.id, body.totp_code):
                raise HTTPException(status_code=403, detail="Invalid TOTP code")

        async with unit_of_work_factory() as txn_db:
            await delete_account(txn_db, current_user)

    return router
