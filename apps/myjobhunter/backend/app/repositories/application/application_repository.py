"""Repository for ``applications`` — owns every query against the table.

Per the layered-architecture rule: routes never touch the ORM, services
orchestrate, repositories return ORM rows. Every public function takes
``user_id`` and filters by it — tenant scoping is mandatory per the
"every query filters by user_id" rule in CLAUDE.md.

Soft-delete convention: ``applications`` carries ``deleted_at``. Reads filter
``deleted_at IS NULL`` by default so soft-deleted rows are invisible to the
list / detail endpoints. ``soft_delete`` is idempotent — calling it on a row
that is already soft-deleted is a no-op (returns the existing row unchanged).

Status query: ``list_with_status`` returns ``(Application, str | None)``
tuples where the second element is the latest ``event_type`` from
``application_events`` via a correlated lateral join on the covering index
``ix_appevent_app_occurred(application_id, occurred_at)``. No denormalized
column is written to the ``applications`` table — status is always computed
at query time per CLAUDE.md architecture rules.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application import Application
from app.models.application.application_event import ApplicationEvent

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


async def list_with_status(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> list[tuple[Application, str | None]]:
    """List a user's non-deleted applications with their latest event type.

    Uses a correlated scalar sub-select (equivalent to a lateral join) so
    PostgreSQL uses the covering index ``ix_appevent_app_occurred`` on
    ``(application_id, occurred_at)`` — one index-only lookup per row with
    no sequential scan of ``application_events``.

    Returns a list of ``(Application, latest_event_type_or_None)`` tuples.
    The ``latest_status`` is ``None`` for applications that have zero events.
    Tenant isolation is enforced on both sides of the correlated sub-query
    (``user_id`` on ``application_events`` as well) so user A's events can
    never bleed into user B's application rows.
    """
    latest_event_sq = (
        select(ApplicationEvent.event_type)
        .where(
            ApplicationEvent.application_id == Application.id,
            ApplicationEvent.user_id == user_id,
        )
        .order_by(ApplicationEvent.occurred_at.desc())
        .limit(1)
        .correlate(Application)
        .scalar_subquery()
    )

    stmt = (
        select(Application, latest_event_sq.label("latest_status"))
        .where(
            Application.user_id == user_id,
            Application.deleted_at.is_(None),
        )
    )
    result = await db.execute(stmt)
    return [(row[0], row[1]) for row in result.all()]


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
