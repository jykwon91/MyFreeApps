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
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi_users.password import PasswordHelper
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.auth.refuse_as_locked import refuse_as_locked
from platform_shared.schemas.account import DeleteAccountRequest
from platform_shared.services.account_lockout import is_locked as account_is_locked
from platform_shared.services.account_deletion import (
    AccountDeletionBlockedError,
    delete_account,
)


def build_account_deletion_router(
    *,
    current_active_user: Callable[..., Awaitable[Any]],
    get_user_manager: Callable[..., Any],
    get_db_dependency: Callable[..., AsyncIterator[AsyncSession]],
    verify_totp_step_up: Callable[
        [AsyncSession, uuid.UUID, str], Awaitable[bool]
    ],
    unit_of_work_factory: Callable[..., Any],
    prepare_deletion: Callable[[AsyncSession, Any], Awaitable[Callable[[], None]]] | None = None,
) -> APIRouter:
    """Build a router exposing ``DELETE /users/me``.

    Args:
        current_active_user: The app's fastapi-users
            ``current_active_user`` dependency.
        get_user_manager: The app's ``get_user_manager`` dependency. Wrong
            passwords and codes count toward the same lockout as login,
            or a stolen token could guess the password here without limit.
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
        prepare_deletion: Runs in that same transaction first, for rows
            the user's cascade can't remove. Raises
            ``AccountDeletionBlockedError`` to refuse with a 409. Returns
            work to run after the commit and the response, for what a
            rollback couldn't undo.

    Returns:
        An ``APIRouter`` with a single DELETE route at ``/users/me``.
        Tagged ``account`` for OpenAPI grouping.
    """
    router = APIRouter(tags=["account"])

    @router.delete("/users/me", status_code=204)
    async def delete_my_account(
        body: DeleteAccountRequest,
        background_tasks: BackgroundTasks,
        request: Request,
        db: AsyncSession = Depends(get_db_dependency),
        current_user: Any = Depends(current_active_user),
        user_manager: Any = Depends(get_user_manager),
    ) -> None:
        """Permanently delete the authenticated user's account and all their data.

        Requires:
        - Correct account password
        - Email address matching the account (typed confirmation)
        - TOTP code if 2FA is enabled
        """
        if account_is_locked(current_user, now=datetime.now(tz=timezone.utc)):
            await refuse_as_locked(db, current_user.id, request)
        await user_manager.reset_stale_failed_logins(current_user)

        # Re-verify password to prevent CSRF and accidental deletion.
        helper = PasswordHelper()
        verified, _ = helper.verify_and_update(
            body.password, current_user.hashed_password
        )
        # Asked whichever way the guess went, so once locked a right guess
        # and a wrong one get the same answer.
        if await user_manager.is_locked_now(current_user):
            await refuse_as_locked(db, current_user.id, request)
        if not verified:
            await user_manager.count_failed_password(current_user)
            raise HTTPException(status_code=403, detail="Incorrect password")
        # Release the row: the delete below runs on another connection.
        await db.commit()

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
            code_ok = await verify_totp_step_up(db, current_user.id, body.totp_code)
            if await user_manager.is_locked_now(current_user):
                await refuse_as_locked(db, current_user.id, request)
            if not code_ok:
                await user_manager.count_failed_second_factor(current_user)
                raise HTTPException(status_code=403, detail="Invalid TOTP code")
            await db.commit()

        try:
            async with unit_of_work_factory() as txn_db:
                after_commit = await prepare_deletion(txn_db, current_user) if prepare_deletion else None
                await delete_account(txn_db, current_user)
        except AccountDeletionBlockedError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        if after_commit is not None:
            background_tasks.add_task(after_commit)

    return router
