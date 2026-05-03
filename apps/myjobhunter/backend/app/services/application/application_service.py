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

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application import Application
from app.models.application.application_event import ApplicationEvent
from app.repositories.application import application_repository, application_event_repository
from app.repositories.company import company_repository
from app.schemas.application.application_create_request import ApplicationCreateRequest
from app.schemas.application.application_event_create_request import ApplicationEventCreateRequest
from app.schemas.application.application_list_item import ApplicationListItem
from app.schemas.application.application_update_request import ApplicationUpdateRequest


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
) -> list[ApplicationListItem]:
    """List a user's non-deleted applications with computed ``latest_status``.

    Delegates to the repository's lateral-join query so status is always
    computed from ``application_events`` — never stored on the applications
    row. Returns ``ApplicationListItem`` instances (Pydantic) ready for
    serialization; the route handler can call ``.model_dump(mode='json')``
    directly without re-validating.

    Optional ``company_id`` narrows results to a single company.  The filter
    is passed through to the repository which applies it after user_id
    scoping — no existence leak regardless of whether the company belongs to
    this user.
    """
    rows = await application_repository.list_with_status(db, user_id, company_id=company_id)
    return [
        ApplicationListItem.model_validate(app).model_copy(update={"latest_status": status})
        for app, status in rows
    ]


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

    Commits at the end so the write survives the request lifecycle —
    ``get_db`` does NOT auto-commit (see ``platform_shared.db.session``),
    matching the explicit-commit pattern used by ``app.api.totp``.
    """
    company = await company_repository.get_by_id(db, request.company_id, user_id)
    if company is None:
        raise CompanyNotOwnedError(
            f"Company {request.company_id} not found under user {user_id}",
        )

    application = Application(
        user_id=user_id,
        company_id=request.company_id,
        role_title=request.role_title,
        url=request.url,
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
    event = ApplicationEvent(
        user_id=user_id,
        application_id=application_id,
        event_type=request.event_type,
        occurred_at=request.occurred_at,
        source=request.source,
        note=request.note,
    )
    event = await application_event_repository.create(db, event)
    await db.commit()
    return event
