"""Hard-delete service for ``DELETE /users/me`` and ``DELETE /users/{id}``.

:func:`delete_account_and_erase_history` is the whole deletion both routes run:
the user's own (:mod:`platform_shared.api.account_deletion_router`, after its
password / email / TOTP gates) and the admin's
(:mod:`platform_shared.api.users_router`). :func:`delete_account` is its
user-row step, where order matters:

1. ``log_auth_event(ACCOUNT_DELETED)`` writes the audit row in the same
   transaction. The ``auth_events.user_id`` column has NO foreign key
   to ``users.id`` (intentional — see
   :mod:`platform_shared.db.models.auth_event`) so the row survives
   the cascade and remains queryable for the admin audit log.

2. ``db.delete(user)`` issues ``DELETE FROM users WHERE id=...``. Every
   app-owned table has ``ON DELETE CASCADE`` on its ``user_id`` FK, so
   the single statement wipes all the user's rows atomically.

The caller (the route handler) is responsible for committing the
surrounding transaction. Neither function commits.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType
from platform_shared.repositories import user_repo
from platform_shared.services.account_already_deleted_error import (
    AccountAlreadyDeletedError,
)
from platform_shared.services.audit_erasure import (
    capture_deletion_scope,
    erase_audit_history,
)
from platform_shared.services.auth_event_service import log_auth_event
from platform_shared.services.prepare_deletion import AfterCommit, PrepareDeletion

logger = logging.getLogger(__name__)


class AccountDeletionBlockedError(Exception):
    """Deleting this account would take something from someone else."""


async def delete_account(
    db: AsyncSession, user: Any, *, request: Request | None, metadata: dict[str, str],
) -> None:
    """Hard-delete ``user``; all related rows cascade-delete via FK.

    Args:
        db: Session that owns the surrounding transaction.
        user: A loaded User-like instance with ``.id`` and ``.email``.
            The function refetches the row by ``type(user)`` so it works
            with both apps' User class without needing the class as a
            parameter. Detached instances are handled correctly.
        request: The deleting request, whose IP and user agent the
            ``ACCOUNT_DELETED`` event records.
        metadata: The event's metadata: who deleted the account.
    """
    logger.warning("Account deletion: user_id=%s", user.id)
    # Refetch via the session so SQLAlchemy emits a real DELETE statement
    # (rather than a no-op when the caller passed a detached instance).
    loaded_user = await db.get(type(user), user.id)
    if loaded_user is None:
        return
    # Log BEFORE delete — the auth_events table has no FK to users, so
    # the event row is safe even after the user cascade completes.
    await log_auth_event(
        db,
        event_type=AuthEventType.ACCOUNT_DELETED,
        user_id=user.id,
        request=request,
        succeeded=True,
        metadata=metadata,
    )
    await db.delete(loaded_user)


async def delete_account_and_erase_history(
    db: AsyncSession,
    user: Any,
    prepare_deletion: PrepareDeletion | None,
    *,
    request: Request | None,
    deleted_by: str,
    actor_id: uuid.UUID,
) -> AfterCommit | None:
    """Delete ``user`` with the app's ``prepare_deletion`` and erase their audit history.

    Runs in ``db``'s transaction, which the caller commits. Returns the work
    ``prepare_deletion`` left for after the commit, or None. ``deleted_by``
    (an :class:`~platform_shared.core.account_deleted_by.AccountDeletedBy`)
    and ``actor_id`` go into the ``ACCOUNT_DELETED`` event with ``request``.

    Raises:
        AccountAlreadyDeletedError: another request deleted the user first.
        AccountDeletionBlockedError: ``prepare_deletion`` refused.
    """
    # Serialise concurrent deletes of one account, so the second one can't
    # collect keys the first has already removed.
    if await user_repo.lock_by_id(db, user.id, user_model=type(user)) is None:
        raise AccountAlreadyDeletedError
    scope = await capture_deletion_scope(db, user)
    after_commit = await prepare_deletion(db, user) if prepare_deletion else None
    await delete_account(
        db, user, request=request, metadata={"by": deleted_by, "actor_id": str(actor_id)},
    )
    await erase_audit_history(db, user, scope)
    return after_commit
