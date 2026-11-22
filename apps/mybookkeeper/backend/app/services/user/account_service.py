"""MBK-specific account-management services.

This module owns:

  * :func:`build_export` — assembles the user's data export of one
    workspace: every table holding their or the workspace's data. MBK-specific
    because the domain rows differ across apps.

The lockout-policy half (``record_failed_login``,
``record_successful_login``, ``is_locked``, ``_lock_duration_for``)
was promoted to ``platform_shared.services.account_lockout`` in PR M7
and is re-exported below for back-compat with existing call sites that
do ``from app.services.user.account_service import record_failed_login``.
The MBK-specific exponential schedule + threshold remain configurable
through ``app.core.config.settings.lockout_threshold`` and
``settings.lockout_autoreset_hours`` — the wrapper functions inject
those values into the shared helpers so production behaviour is
byte-identical with pre-M7.
"""
from datetime import UTC, datetime
from typing import Any, Optional

from platform_shared.core.auth_events import AuthEventType
from platform_shared.services.account_lockout import (
    autoreset_update_if_stale as _autoreset_update_if_stale,
)
from platform_shared.services.account_lockout import (
    is_locked as _shared_is_locked,
)
from platform_shared.services.account_lockout import (
    record_failed_login as _shared_record_failed_login,
)
from platform_shared.services.account_lockout import (
    record_successful_login_update as _shared_record_successful_login_update,
)
from platform_shared.services.auth_event_service import log_auth_event
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.account_export_constants import EXPORT_USER_SECTION
from app.core.config import settings
from app.core.context import RequestContext
from app.mappers.export.account_export_mapper_registry import EXPORT_MAPPERS
from app.mappers.export.json_value import JsonValue
from app.models.user.user import User
from app.repositories.user import account_export_repo

# ---------------------------------------------------------------------------
# Back-compat lockout shims
#
# Existing callers (and any future callers) that do
# ``from app.services.user.account_service import record_failed_login``
# keep working. New code should import directly from
# ``platform_shared.services.account_lockout``.
# ---------------------------------------------------------------------------


async def record_failed_login(
    user: User,
    db: AsyncSession,
    *,
    metadata: Optional[dict[str, Any]] = None,
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    """Compute the post-failure update dict and emit a LOGIN_FAILURE row.

    Back-compat wrapper that injects MBK's configured lockout threshold
    and the standard ``log_auth_event`` writer. Returns the update dict
    the caller must persist (mirrors the contract of the shared helper).
    Audit semantics are preserved byte-identical with pre-M7 — see the
    note on :func:`platform_shared.services.account_lockout.record_failed_login`.
    """
    return await _shared_record_failed_login(
        user,
        db=db,
        user_id=user.id,
        lockout_threshold=settings.lockout_threshold,
        metadata=metadata,
        now=now,
    )


def record_successful_login(user: User) -> Optional[dict[str, Any]]:
    """Return the clear-counters update dict, or ``None`` if nothing to clear."""
    return _shared_record_successful_login_update(user)


def is_locked(user: User, *, now: Optional[datetime] = None) -> bool:
    """Return ``True`` iff the account is currently locked."""
    return _shared_is_locked(user, now=now)


def autoreset_update_if_stale(
    user: User,
    *,
    now: Optional[datetime] = None,
) -> Optional[dict[str, Any]]:
    """Return the auto-reset update dict if the counter is stale, else ``None``."""
    return _autoreset_update_if_stale(
        user,
        now=now,
        autoreset_hours=settings.lockout_autoreset_hours,
    )


async def build_export(
    db: AsyncSession,
    user: User,
    ctx: RequestContext,
) -> dict[str, JsonValue]:
    """Assemble the user's data export for the organization in ``ctx``.

    Every table holding the user's or the workspace's data is exported (see
    ``account_export_sources`` for how each is scoped), scoped to the org the
    caller is a current member of, so data the user created in an org they
    have since left is never exported. A table the caller's role cannot read
    in the app is left out.
    Secrets and internal-only columns are left out, each for a reason
    recorded in ``app.core.account_export_constants``.
    """
    rows_by_table = await account_export_repo.list_account_export_rows(
        db, ctx.organization_id, ctx.user_id, ctx.org_role,
    )

    await log_auth_event(
        db,
        event_type=AuthEventType.DATA_EXPORTED,
        user_id=user.id,
        succeeded=True,
    )

    payload: dict[str, JsonValue] = {
        "exported_at": datetime.now(UTC).isoformat(),
        EXPORT_USER_SECTION: EXPORT_MAPPERS[User.__tablename__](user),
    }
    for table_name, rows in rows_by_table.items():
        mapper = EXPORT_MAPPERS[table_name]
        payload[table_name] = [mapper(row) for row in rows]
    return payload
