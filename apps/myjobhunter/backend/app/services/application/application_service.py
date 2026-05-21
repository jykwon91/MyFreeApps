"""Application service — orchestration for the Applications domain.

Per the layered-architecture rule (apps/myjobhunter/CLAUDE.md):
"Routes → Services → Repositories; never import ORM/DB in route handlers."
Services orchestrate (load → validate → persist), repositories own queries.

Tenant isolation: every public function takes ``user_id`` and forwards it
to the repo. ``company_id`` ownership is verified against the same ``user_id``
before persisting an Application — a malicious caller cannot link their
application to another user's company.

Audit: writes happen inside the request-scoped ``AsyncSession`` provided by
the route via ``Depends(get_db)``. The shared SQLAlchemy session listener
(registered in ``app.main`` lifespan via ``register_audit_listeners``) emits
``audit_logs`` rows automatically — no manual instrumentation needed.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application import Application
from app.models.application.application_contact import ApplicationContact
from app.models.application.application_event import ApplicationEvent
from app.repositories.application import (
    application_contact_repository,
    application_event_repository,
    application_repository,
)
from app.repositories.company import company_repository
from app.schemas.application.application_contact_create_request import ApplicationContactCreateRequest
from app.schemas.application.application_contact_response import ApplicationContactResponse
from app.schemas.application.application_create_request import ApplicationCreateRequest
from app.schemas.application.application_detail_response import ApplicationDetailResponse
from app.schemas.application.application_event_create_request import ApplicationEventCreateRequest
from app.schemas.application.application_event_response import ApplicationEventResponse
from app.schemas.application.application_event_update_request import ApplicationEventUpdateRequest
from app.schemas.application.application_kanban_item import ApplicationKanbanItem
from app.schemas.application.application_list_item import ApplicationListItem
from app.schemas.application.application_update_request import ApplicationUpdateRequest


_EDITABLE_EVENT_TYPES = frozenset({"interview_scheduled", "interview_completed"})


class EventTypeNotEditableError(ValueError):
    """Raised when a PATCH targets an event whose ``event_type`` is not in
    the editable allowlist.

    Only ``interview_scheduled`` and ``interview_completed`` events can be
    edited — system-generated events (``applied``, ``email_received``,
    kanban transitions) remain immutable so the audit trail stays trustworthy.

    The route handler maps this to HTTP 422 with a stable detail literal
    so the frontend can route on it deterministically.
    """


class CompanyNotOwnedError(LookupError):
    """Raised when the supplied ``company_id`` does not belong to the caller.

    Subclasses ``LookupError`` so the route handler can map it to HTTP 422
    without leaking whether the company exists at all in the system —
    "I can't find that company under your account" is the same response
    whether the company is missing or owned by someone else.
    """


async def list_applications(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    company_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    archived: bool | None = None,
    since: _dt.datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[ApplicationListItem]:
    """List a user's non-deleted applications with computed ``latest_status``.

    Delegates to the repository's lateral-join query so status is always
    computed from ``application_events`` — never stored on the applications
    row. Returns ``ApplicationListItem`` instances (Pydantic) ready for
    serialization; the route handler can call ``.model_dump(mode='json')``
    directly without re-validating.

    Optional filters:
    - ``company_id``: narrow to a single company (tenant-safe).
    - ``status_filter``: keep only rows whose latest event_type matches.
    - ``archived``: ``True`` = archived only; ``False`` = active only; ``None`` = all.
    - ``since``: include only applications with ``applied_at >= since``.
    - ``limit`` / ``offset``: pagination (default limit=100, offset=0).
    """
    rows = await application_repository.list_with_status(
        db,
        user_id,
        company_id=company_id,
        status_filter=status_filter,
        archived=archived,
        since=since,
        limit=limit,
        offset=offset,
    )
    return [
        ApplicationListItem.model_validate(app).model_copy(
            update={"latest_status": status, "company_name": company_name},
        )
        for app, status, company_name in rows
    ]


async def list_kanban_items(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> list[ApplicationKanbanItem]:
    """Return non-archived applications shaped for the kanban dashboard.

    Each row carries the company display fields, the most-recent
    stage-defining event, and the verdict from the analysis that
    spawned the application (if any). The frontend derives the column
    id from ``latest_event_type`` via the same mapping the transition
    service uses so the read and write sides stay in sync.
    """
    rows = await application_repository.list_for_kanban(db, user_id)
    return [ApplicationKanbanItem.model_validate(row) for row in rows]


async def get_application_detail(
    db: AsyncSession,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
) -> ApplicationDetailResponse | None:
    """Return a non-deleted application with eagerly-loaded events and contacts.

    Events are sorted newest-first; contacts are sorted oldest-first (insertion
    order). Returns ``None`` if the application is missing, soft-deleted, or
    belongs to another user.
    """
    application = await application_repository.get_with_detail(db, application_id, user_id)
    if application is None:
        return None

    # Sort events newest-first (the selectinload does not guarantee order).
    sorted_events = sorted(application.events, key=lambda e: e.occurred_at, reverse=True)
    sorted_contacts = sorted(application.contacts, key=lambda c: c.created_at)

    return ApplicationDetailResponse.model_validate(application).model_copy(
        update={
            "events": [ApplicationEventResponse.model_validate(e) for e in sorted_events],
            "contacts": [ApplicationContactResponse.model_validate(c) for c in sorted_contacts],
        }
    )


async def get_application(
    db: AsyncSession,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
) -> Application | None:
    """Return a non-deleted application scoped to ``user_id`` or ``None``."""
    return await application_repository.get_by_id(db, application_id, user_id)


async def create_application(
    db: AsyncSession,
    user_id: uuid.UUID,
    request: ApplicationCreateRequest,
) -> Application:
    """Persist a new ``Application`` scoped to ``user_id``.

    Verifies the supplied ``company_id`` belongs to ``user_id`` before
    persisting. Raises :class:`CompanyNotOwnedError` if not — the route
    handler maps this to HTTP 422 with a generic detail message.

    Automatically logs an ``applied`` event after the application row is
    created, using ``applied_at`` from the request as the ``occurred_at``
    (falling back to ``datetime.now(UTC)`` when not supplied). This ensures
    every newly-created application has a baseline status in the event log
    so ``latest_status`` in the list endpoint is never ``None`` for a brand-
    new application.

    Commits at the end so the write survives the request lifecycle —
    ``get_db`` does NOT auto-commit (see ``platform_shared.db.session``),
    matching the explicit-commit pattern used by ``app.api.totp``.
    """
    company = await company_repository.get_by_id(db, request.company_id, user_id)
    if company is None:
        raise CompanyNotOwnedError(
            f"Company {request.company_id} not found under user {user_id}",
        )

    # ``url`` is typed as Pydantic ``AnyHttpUrl`` for input validation.
    # In Pydantic v2 that's a ``Url`` wrapper object — NOT a str
    # subclass — so passing it directly to SQLAlchemy / asyncpg raises
    # at parameter-bind time (HTTP 500). Coerce to plain str before
    # persistence. Same pattern as company_service.create_company's
    # logo_url fix from PR #363.
    application = Application(
        user_id=user_id,
        company_id=request.company_id,
        role_title=request.role_title,
        url=str(request.url) if request.url is not None else None,
        jd_text=request.jd_text,
        jd_parsed=request.jd_parsed,
        source=request.source,
        applied_at=request.applied_at,
        posted_salary_min=request.posted_salary_min,
        posted_salary_max=request.posted_salary_max,
        posted_salary_currency=request.posted_salary_currency,
        posted_salary_period=request.posted_salary_period,
        location=request.location,
        remote_type=request.remote_type,
        fit_score=request.fit_score,
        notes=request.notes,
        archived=request.archived,
        external_ref=request.external_ref,
        external_source=request.external_source,
    )
    application = await application_repository.create(db, application)

    # Auto-log the initial "applied" event so latest_status is never None
    # for a freshly-created application. The occurred_at mirrors applied_at
    # (user-supplied submission date) or falls back to now.
    initial_event = ApplicationEvent(
        user_id=user_id,
        application_id=application.id,
        event_type="applied",
        occurred_at=request.applied_at or _dt.datetime.now(_dt.timezone.utc),
        source="system",
    )
    await application_event_repository.create(db, initial_event)

    await db.commit()
    return application


async def update_application(
    db: AsyncSession,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
    request: ApplicationUpdateRequest,
) -> Application | None:
    """Apply allowlisted PATCH updates to an Application.

    Returns ``None`` if the application does not exist, is soft-deleted, or
    belongs to a different user. The route handler maps ``None`` to HTTP 404
    so cross-tenant probing yields the same response as a genuine miss.

    If the PATCH body changes ``company_id``, the new company must also belong
    to ``user_id``; otherwise :class:`CompanyNotOwnedError` is raised.

    Commits at the end so the write survives the request lifecycle.
    """
    application = await application_repository.get_by_id(db, application_id, user_id)
    if application is None:
        return None

    updates = request.to_update_dict()

    if "company_id" in updates:
        new_company = await company_repository.get_by_id(db, updates["company_id"], user_id)
        if new_company is None:
            raise CompanyNotOwnedError(
                f"Company {updates['company_id']} not found under user {user_id}",
            )

    application = await application_repository.update(db, application, updates)
    await db.commit()
    return application


async def soft_delete_application(
    db: AsyncSession,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
) -> bool:
    """Soft-delete an Application scoped to ``user_id``.

    Idempotent — returns ``True`` if a row was found (whether or not it was
    already soft-deleted), ``False`` if the application does not exist or
    belongs to another user. ``include_deleted=True`` so a second DELETE on
    an already-deleted row still returns 204.

    Commits at the end so the write survives the request lifecycle.
    """
    application = await application_repository.get_by_id(
        db, application_id, user_id, include_deleted=True,
    )
    if application is None:
        return False
    await application_repository.soft_delete(db, application)
    await db.commit()
    return True


async def list_application_events(
    db: AsyncSession,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
) -> list[ApplicationEvent] | None:
    """Return events for ``application_id`` ordered newest-first.

    Returns ``None`` if the application does not exist under ``user_id``
    so the route layer can map to HTTP 404 with no existence leak. Soft-
    deleted applications also return ``None`` — events are not visible
    after the parent application is deleted.
    """
    application = await application_repository.get_by_id(db, application_id, user_id)
    if application is None:
        return None
    return await application_event_repository.list_by_application(db, user_id, application_id)


async def log_application_event(
    db: AsyncSession,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
    request: ApplicationEventCreateRequest,
) -> ApplicationEvent | None:
    """Persist a new event against an application.

    Returns ``None`` if the application does not exist under ``user_id``
    (route layer maps to 404). The event's ``user_id`` is denormalized
    from the parent application; the route never trusts a body-provided
    ``user_id`` (the schema's ``extra='forbid'`` rejects it anyway).

    Commits at the end so the write survives the request lifecycle.
    """
    application = await application_repository.get_by_id(db, application_id, user_id)
    if application is None:
        return None

    # Serialise the nested InterviewDetailsRequest to a plain dict for JSONB
    # storage.  ``model_dump(mode="json")`` converts datetime fields to ISO
    # strings (JSONB-safe) and drops None sub-fields so the stored blob stays
    # compact.  When ``interview_details`` is None the column stores NULL.
    interview_details_dict: dict | None = None
    if request.interview_details is not None:
        interview_details_dict = request.interview_details.model_dump(
            mode="json",
            exclude_none=True,
        )

    event = ApplicationEvent(
        user_id=user_id,
        application_id=application_id,
        event_type=request.event_type,
        occurred_at=request.occurred_at,
        source=request.source,
        note=request.note,
        interview_details=interview_details_dict,
    )
    event = await application_event_repository.create(db, event)
    await db.commit()
    return event


async def update_application_event(
    db: AsyncSession,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
    event_id: uuid.UUID,
    request: ApplicationEventUpdateRequest,
) -> ApplicationEvent | None:
    """Apply a partial update to an ApplicationEvent.

    Returns ``None`` when the event does not exist under
    ``(user_id, application_id)`` — the route maps to HTTP 404 with no
    existence leak (a caller who knows an event UUID but not the parent
    application gets the same response as a genuine miss).

    Raises ``EventTypeNotEditableError`` when the targeted event's
    ``event_type`` is not in ``_EDITABLE_EVENT_TYPES`` — the route maps
    to HTTP 422.  Only the two user-input columns may be patched
    (``interview_details``, ``note``); every other column is immutable
    via the schema's ``extra='forbid'`` and the route's body shape.

    ``exclude_unset=True`` semantics: fields the caller omitted stay
    untouched on the row; fields explicitly set to ``null`` clear the
    column.  Mirrors the application-level PATCH on update_application.
    """
    event = await application_event_repository.get_by_id(
        db, user_id, application_id, event_id,
    )
    if event is None:
        return None

    if event.event_type not in _EDITABLE_EVENT_TYPES:
        raise EventTypeNotEditableError(
            f"event_type {event.event_type!r} is not editable",
        )

    updates = request.model_dump(exclude_unset=True)

    if "interview_details" in updates:
        details = request.interview_details
        if details is None:
            event.interview_details = None
        else:
            event.interview_details = details.model_dump(
                mode="json",
                exclude_none=True,
            )

    if "note" in updates:
        event.note = request.note

    await db.flush()
    await db.refresh(event)
    await db.commit()
    return event


async def create_application_contact(
    db: AsyncSession,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
    request: ApplicationContactCreateRequest,
) -> ApplicationContact | None:
    """Persist a new contact against an application.

    Returns ``None`` if the application does not exist under ``user_id``
    (route layer maps to 404). The contact's ``user_id`` is denormalized
    from the parent application context — the route never trusts a
    body-provided ``user_id`` (the schema's ``extra='forbid'`` rejects it).

    Commits at the end so the write survives the request lifecycle.
    """
    application = await application_repository.get_by_id(db, application_id, user_id)
    if application is None:
        return None
    contact = ApplicationContact(
        user_id=user_id,
        application_id=application_id,
        name=request.name,
        email=str(request.email) if request.email is not None else None,
        linkedin_url=request.linkedin_url,
        role=request.role,
        notes=request.notes,
    )
    contact = await application_contact_repository.create(db, contact)
    await db.commit()
    return contact


async def delete_application_contact(
    db: AsyncSession,
    user_id: uuid.UUID,
    application_id: uuid.UUID,
    contact_id: uuid.UUID,
) -> bool:
    """Hard-delete a contact scoped by both application and user.

    The composite WHERE on ``(id, application_id, user_id)`` is the IDOR
    guard — a caller who knows a contact UUID but does not own the parent
    application cannot reach it.

    Returns ``True`` if the row was found and deleted, ``False`` if not
    found (or if the application/contact IDs are cross-tenant — the route
    layer maps both to 404 so callers cannot distinguish the two cases).

    Commits at the end so the write survives the request lifecycle.
    """
    contact = await application_contact_repository.get_by_id(
        db, contact_id, application_id, user_id,
    )
    if contact is None:
        return False
    await application_contact_repository.delete(db, contact)
    await db.commit()
    return True
