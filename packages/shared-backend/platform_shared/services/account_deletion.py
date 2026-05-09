"""Hard-delete service for ``DELETE /users/me`` — emits audit event + cascade.

The route in :mod:`platform_shared.api.account_deletion_router` calls
this after the password / email / TOTP gates pass.

Order matters:

1. ``log_auth_event(ACCOUNT_DELETED)`` writes the audit row in the same
   transaction. The ``auth_events.user_id`` column has NO foreign key
   to ``users.id`` (intentional — see
   :mod:`platform_shared.db.models.auth_event`) so the row survives
   the cascade and remains queryable for the admin audit log.

2. ``db.delete(user)`` issues ``DELETE FROM users WHERE id=...``. Every
   app-owned table has ``ON DELETE CASCADE`` on its ``user_id`` FK, so
   the single statement wipes all the user's rows atomically.

The caller (the route handler) is responsible for committing the
surrounding transaction. This function does not flush or commit.
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.auth_events import AuthEventType
from platform_shared.services.auth_event_service import log_auth_event

logger = logging.getLogger(__name__)


async def delete_account(db: AsyncSession, user: Any) -> None:
    """Hard-delete ``user``; all related rows cascade-delete via FK.

    Args:
        db: Session that owns the surrounding transaction.
        user: A loaded User-like instance with ``.id`` and ``.email``.
            The function refetches the row by ``type(user)`` so it works
            with both apps' User class without needing the class as a
            parameter. Detached instances are handled correctly.
    """
    logger.warning(
        "Account deletion: user_id=%s email=%s",
        user.id,
        user.email,
    )
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
        succeeded=True,
    )
    await db.delete(loaded_user)
