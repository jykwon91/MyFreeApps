"""Repository for ``applications`` — owns every query against the table.

Per the layered-architecture rule: routes never touch the ORM, services
orchestrate, repositories return ORM rows. Every public function takes
``user_id`` and filters by it — tenant scoping is mandatory per the
"every query filters by user_id" rule in CLAUDE.md.

Soft-delete convention: ``applications`` carries ``deleted_at``. Reads filter
``deleted_at IS NULL`` by default so soft-deleted rows are invisible to the
list / detail endpoints. ``soft_delete`` is idempotent — calling it on a row
that is already soft-deleted is a no-op (returns the existing row unchanged).

Status query: ``list_with_status`` returns
``(Application, str | None, str)`` tuples where the second element is the
latest ``event_type`` from ``application_events`` via a LATERAL join on the
covering index ``ix_appevent_app_occurred(application_id, occurred_at)
INCLUDE (event_type)`` (ties on ``occurred_at`` broken by ``created_at`` then
``id``; see ``application_list_query``), and the third element is the ``companies.name`` of
the application's owning company (INNER joined since
``applications.company_id`` is non-null). The INCLUDE column lets PostgreSQL
satisfy the lateral read entirely from the index leaf pages (Index Only Scan)
with no heap fetch. No denormalized column is written to the ``applications``
table — status is always computed at query time per CLAUDE.md architecture
rules. ``count_with_status`` counts the same rows across all pages.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from sqlalchemy import delete, func, literal_column, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from platform_shared.repositories import soft_delete as _soft_delete

from app.core.application_list_constants import DEFAULT_PAGE_SIZE, DEFAULT_SORT_FIELD, DEFAULT_SORT_ORDER
from app.core.application_sort_field import ApplicationSortField
from app.core.sort_order import SortOrder
from app.models.application.application import Application
from app.models.application.application_event import ApplicationEvent
from app.models.company.company import Company
from app.models.job_analysis.job_analysis import JobAnalysis
from app.repositories.application.application_list_query import (
    LATEST_EVENT_ORDER,
    latest_event_lateral,
    list_conditions,
    sort_expressions,
)


# Event types that DEFINE a kanban stage. Filtered out: ``note_added``,
# ``email_received``, ``follow_up_sent`` — these record activity but
# don't transition the application to a different column.
_STAGE_EVENT_TYPES: tuple[str, ...] = (
    "applied",
    "interview_scheduled",
    "interview_completed",
    "offer_received",
    "rejected",
    "withdrawn",
    "ghosted",
)

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


async def count_for_company_including_deleted(
    db: AsyncSession, company_id: uuid.UUID, user_id: uuid.UUID,
) -> int:
    """Count every application linked to the company, soft-deleted rows included.

    Soft-deleted rows still hold the ``applications.company_id`` RESTRICT FK,
    so they must be counted when deciding whether a company can be removed.
    """
    result = await db.execute(
        select(func.count())
        .select_from(Application)
        .where(Application.company_id == company_id, Application.user_id == user_id)
    )
    return int(result.scalar_one())


async def list_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[Application]:
    """List a user's non-deleted applications."""
    result = await db.execute(
        select(Application).where(
            Application.user_id == user_id,
            Application.deleted_at.is_(None),
        )
    )
    return list(result.scalars().all())


async def get_with_detail(
    db: AsyncSession,
    application_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Application | None:
    """Return an application with eagerly-loaded events and contacts.

    Events are ordered newest-first; contacts are ordered oldest-first.
    Returns ``None`` if the application does not exist, is soft-deleted,
    or belongs to a different user (tenant isolation).

    Uses ``selectinload`` for both relationships — two additional SELECT
    statements instead of a JOIN, which avoids row-multiplication when both
    collections are non-empty.
    """
    result = await db.execute(
        select(Application)
        .options(
            selectinload(Application.events),
            selectinload(Application.contacts),
        )
        .where(
            Application.id == application_id,
            Application.user_id == user_id,
            Application.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def list_with_status(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    company_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    archived: bool | None = None,
    since: _dt.datetime | None = None,
    sort: ApplicationSortField = DEFAULT_SORT_FIELD,
    order: SortOrder = DEFAULT_SORT_ORDER,
    limit: int = DEFAULT_PAGE_SIZE,
    offset: int = 0,
) -> list[tuple[Application, str | None, str]]:
    """One page of a user's non-deleted applications with latest event type and company name.

    Returns ``(Application, latest_event_type_or_None, company_name)`` tuples.
    ``latest_status`` is ``None`` for applications with zero events. The
    ``companies`` join is INNER because ``applications.company_id`` is
    non-null at the schema level.

    Every filter is applied in SQL, before ``OFFSET`` / ``LIMIT``, so pages
    are exact and ``count_with_status`` with the same filters gives the
    total across pages.

    Ordering: ``sort`` (one of ``_sort_expressions``; anything else raises
    ``ValueError``) in ``order``, missing values last either way, then the
    default order — applied most recently first, newest created first — and
    finally ``id`` so rows that tie on everything still page stably.

    Optional filters:
    - ``company_id``: narrow to a specific company (tenant-safe — returns
      an empty list, not 403/404, for cross-tenant probing).
    - ``status_filter``: keep only rows whose latest event_type matches.
    - ``archived``: ``True`` archived only; ``False`` active only; ``None`` both.
    - ``since``: include only applications with ``applied_at >= since``.
    """
    latest_event = latest_event_lateral(user_id)
    sortable = sort_expressions(latest_event)
    if sort not in sortable:
        raise ValueError(f"Unknown sort field: {sort!r}")
    primary = sortable[sort]
    primary_order = primary.asc() if order == "asc" else primary.desc()

    stmt = (
        select(
            Application,
            latest_event.c.event_type.label("latest_status"),
            Company.name.label("company_name"),
        )
        .join(Company, Application.company_id == Company.id)
        .outerjoin(latest_event, true())
        .where(
            *list_conditions(
                user_id,
                latest_event,
                company_id=company_id,
                status_filter=status_filter,
                archived=archived,
                since=since,
            ),
        )
        .order_by(
            primary_order.nulls_last(),
            Application.applied_at.desc().nulls_last(),
            Application.created_at.desc(),
            Application.id.desc(),
        )
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [(row[0], row[1], row[2]) for row in result.all()]


async def count_with_status(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    company_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    archived: bool | None = None,
    since: _dt.datetime | None = None,
) -> int:
    """How many rows ``list_with_status`` matches across all pages, same filters and tenant scope."""
    latest_event = latest_event_lateral(user_id)
    stmt = (
        select(func.count())
        .select_from(Application)
        .join(Company, Application.company_id == Company.id)
        .where(
            *list_conditions(
                user_id,
                latest_event,
                company_id=company_id,
                status_filter=status_filter,
                archived=archived,
                since=since,
            ),
        )
    )
    # The latest event is only needed to filter on it.
    if status_filter is not None:
        stmt = stmt.outerjoin(latest_event, true())
    result = await db.execute(stmt)
    return int(result.scalar_one())


async def list_for_kanban(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> list[dict[str, Any]]:
    """Return non-archived, non-deleted applications shaped for the kanban.

    Joins:
    - ``companies`` (INNER) — for the company name + logo on each card
    - ``application_events`` (LATERAL) — for the most-recent
      *stage-defining* event (note_added / email_received /
      follow_up_sent are excluded)
    - ``job_analyses`` (LEFT) — for the verdict on the analysis that
      spawned the application, if any

    Tenant isolation: ``user_id`` is filtered on the application AND
    on the lateral subquery's ``application_events`` join AND on the
    ``job_analyses`` join. Per the security agent's "filter on both
    sides of the join" rule, this is mandatory — without the
    ``ja.user_id = a.user_id`` predicate, a misuse case where two
    users have a colliding ``applied_application_id`` would leak the
    other user's verdict.

    Returns a list of dicts (not ORM objects) because the shape spans
    three tables and the kanban schema is read-only — there's no
    benefit to instantiating ORM rows we'll never mutate.
    """
    # LATERAL subquery: most-recent stage-defining event per application.
    latest_event = (
        select(
            ApplicationEvent.event_type.label("latest_event_type"),
            ApplicationEvent.occurred_at.label("stage_entered_at"),
        )
        .where(
            ApplicationEvent.application_id == Application.id,
            ApplicationEvent.user_id == user_id,
            ApplicationEvent.event_type.in_(_STAGE_EVENT_TYPES),
        )
        .order_by(*LATEST_EVENT_ORDER)
        .limit(1)
        .lateral("e")
    )

    stmt = (
        select(
            Application.id,
            Application.role_title,
            Application.applied_at,
            Application.archived,
            Company.id.label("company_id"),
            Company.name.label("company_name"),
            Company.logo_url.label("company_logo_url"),
            literal_column("e.latest_event_type").label("latest_event_type"),
            literal_column("e.stage_entered_at").label("stage_entered_at"),
            JobAnalysis.verdict,
        )
        .join(Company, Company.id == Application.company_id)
        .outerjoin(latest_event, literal_column("true"))
        .outerjoin(
            JobAnalysis,
            (JobAnalysis.applied_application_id == Application.id)
            & (JobAnalysis.user_id == Application.user_id)
            & (JobAnalysis.deleted_at.is_(None)),
        )
        .where(
            Application.user_id == user_id,
            Application.archived.is_(False),
            Application.deleted_at.is_(None),
        )
        .order_by(Application.applied_at.desc().nullslast(), Application.created_at.desc())
    )
    result = await db.execute(stmt)
    return [dict(row._mapping) for row in result.all()]


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
    was_deleted = await _soft_delete(db, application)
    if was_deleted:
        await db.refresh(application)
    return application


async def delete_all_for_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Hard-delete every application a user owns, soft-deleted ones included.

    Only account deletion uses this. Events, contacts and documents hanging off
    the applications go with them through their ``ON DELETE CASCADE`` keys.
    """
    await db.execute(delete(Application).where(Application.user_id == user_id))
