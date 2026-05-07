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
``application_events`` via a correlated scalar sub-select on the covering
index ``ix_appevent_app_occurred(application_id, occurred_at) INCLUDE
(event_type)``.  The INCLUDE column lets PostgreSQL satisfy the sub-select
entirely from the index leaf pages (Index Only Scan) with no heap fetch.
No denormalized column is written to the ``applications`` table — status
is always computed at query time per CLAUDE.md architecture rules.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from sqlalchemy import literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.application.application import Application
from app.models.application.application_event import ApplicationEvent
from app.models.company.company import Company
from app.models.job_analysis.job_analysis import JobAnalysis


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
    limit: int = 100,
    offset: int = 0,
) -> list[tuple[Application, str | None]]:
    """List a user's non-deleted applications with their latest event type.

    Uses a correlated scalar sub-select (equivalent to a lateral join) so
    PostgreSQL can use the covering index ``ix_appevent_app_occurred`` on
    ``(application_id, occurred_at) INCLUDE (event_type)`` — one Index
    Only Scan per row with no heap fetch and no sequential scan of
    ``application_events``.

    Returns a list of ``(Application, latest_event_type_or_None)`` tuples.
    The ``latest_status`` is ``None`` for applications that have zero events.
    Tenant isolation is enforced on both sides of the correlated sub-query
    (``user_id`` on ``application_events`` as well) so user A's events can
    never bleed into user B's application rows.

    Optional filters:
    - ``company_id``: narrow to a specific company (tenant-safe — returns
      empty list, not 403/404, for cross-tenant probing).
    - ``status_filter``: keep only rows whose latest event_type matches this
      string.  Applied in Python after the query (the sub-select is already
      scalar; a HAVING clause would require a different query shape).
    - ``archived``: when ``True`` include only archived rows; when ``False``
      include only non-archived rows; when ``None`` include both.
    - ``since``: include only applications with ``applied_at >= since``.
    - ``limit`` / ``offset``: standard pagination.  Offset is applied on the
      ``applications`` table before status filtering for correct page sizes;
      callers that need exact pages with status filtering should pass ``None``
      for ``status_filter`` and filter in the service layer.
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
        .order_by(Application.applied_at.desc().nullslast(), Application.created_at.desc())
    )
    if company_id is not None:
        stmt = stmt.where(Application.company_id == company_id)
    if archived is not None:
        stmt = stmt.where(Application.archived == archived)
    if since is not None:
        stmt = stmt.where(Application.applied_at >= since)

    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    rows = [(row[0], row[1]) for row in result.all()]

    # status_filter is applied post-query because it filters on the sub-select
    # label value, which is not a real column and cannot be used in WHERE.
    if status_filter is not None:
        rows = [(app, status) for app, status in rows if status == status_filter]

    return rows


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
        .order_by(ApplicationEvent.occurred_at.desc())
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
    if application.deleted_at is None:
        application.deleted_at = _dt.datetime.now(_dt.timezone.utc)
        await db.flush()
        await db.refresh(application)
    return application
