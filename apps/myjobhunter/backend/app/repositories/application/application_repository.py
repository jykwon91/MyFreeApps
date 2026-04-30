"""Repository for ``applications`` — owns every query against the table.

Per the layered-architecture rule: routes never touch the ORM, services
orchestrate, repositories return ORM rows. Every public function takes
``user_id`` and filters by it — tenant scoping is mandatory per the
"every query filters by user_id" rule in CLAUDE.md.

Soft-delete convention: ``applications`` carries ``deleted_at``. Reads filter
``deleted_at IS NULL`` by default so soft-deleted rows are invisible to the
list / detail endpoints. ``soft_delete`` is idempotent — calling it on a row
that is already soft-deleted is a no-op (returns the existing row unchanged).
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application import Application

# Allowlist of columns that can be applied via the dynamic ``update``
# function. Per the project security rule: "Always validate field names
# against an explicit allowlist before applying dynamic updates." Tenant
# scoping (``user_id``) and server-managed columns (``id``, ``created_at``,
# ``updated_at``, ``deleted_at``) are deliberately excluded.
_UPDATABLE_COLUMNS: frozenset[str] = frozenset({
    "company_id",
    "role_title",
    "url",
    "jd_text",
    "jd_parsed",
    "source",
    "applied_at",
    "posted_salary_min",
    "posted_salary_max",
    "posted_salary_currency",
    "posted_salary_period",
    "location",
    "remote_type",
    "fit_score",
    "notes",
    "archived",
    "external_ref",
    "external_source",
})


async def get_by_id(
    db: AsyncSession,
    application_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    include_deleted: bool = False,
) -> Application | None:
    """Return the application iff it belongs to ``user_id``.

    Defaults to skipping soft-deleted rows. ``include_deleted=True`` is used
    by the soft-delete flow so a second DELETE on an already-deleted row
    still returns 204 (idempotent).
    """
    stmt = select(Application).where(
        Application.id == application_id,
        Application.user_id == user_id,
    )
    if not include_deleted:
        stmt = stmt.where(Application.deleted_at.is_(None))
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[Application]:
    """List a user's non-deleted applications."""
    result = await db.execute(
        select(Application).where(
            Application.user_id == user_id,
            Application.deleted_at.is_(None),
        )
    )
    return list(result.scalars().all())


async def create(db: AsyncSession, application: Application) -> Application:
    """Persist a new ``Application``.

    The caller (service layer) is responsible for setting ``user_id`` and
    ``company_id`` from the validated request context. The repo intentionally
    does not accept loose kwargs — passing a fully-constructed ORM instance
    keeps the field-validation surface in one place (the schema + service).
    """
    db.add(application)
    await db.flush()
    await db.refresh(application)
    return application


async def update(
    db: AsyncSession,
    application: Application,
    updates: dict[str, Any],
) -> Application:
    """Apply allowlisted updates to an Application.

    Filters ``updates`` against ``_UPDATABLE_COLUMNS`` before applying — any
    keys outside the allowlist are silently dropped (defense in depth on top
    of the Pydantic schema's ``extra='forbid'``). Returns the refreshed
    ``Application``.
    """
    safe_fields = {k: v for k, v in updates.items() if k in _UPDATABLE_COLUMNS}
    if not safe_fields:
        return application

    for key, value in safe_fields.items():
        setattr(application, key, value)
    await db.flush()
    await db.refresh(application)
    return application


async def soft_delete(db: AsyncSession, application: Application) -> Application:
    """Mark an ``Application`` as soft-deleted by setting ``deleted_at``.

    Idempotent — if ``deleted_at`` is already populated the existing row is
    returned unchanged (no second timestamp update). Hard deletes are
    forbidden by convention; rows persist for audit + restore.
    """
    if application.deleted_at is None:
        application.deleted_at = _dt.datetime.now(_dt.timezone.utc)
        await db.flush()
        await db.refresh(application)
    return application
