"""HTTP routes for the Applications domain.

Phase 1 shipped read-only ``GET /applications``. Phase 2 PR 2.1a (this PR)
ships POST / PATCH / DELETE — full CRUD against the existing table.

Auth: every endpoint requires an authenticated user via
``current_active_user``. Tenant scoping is mandatory — every operation
scopes the query by ``user.id`` so cross-tenant access yields HTTP 404 with
the same body as a genuine miss (no existence leak).

Audit: writes are captured automatically by the shared SQLAlchemy
``after_flush`` listener registered in ``app.main`` lifespan — no manual
instrumentation needed in the route handlers.

Pattern reference: MyBookkeeper vendors PR #108 (sibling app in the
``MyFreeApps`` monorepo). The route → service → repo split, allowlisted
PATCH semantics, soft-delete idempotency, and 404-on-cross-tenant policy
all mirror that PR.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.application.application_create_request import ApplicationCreateRequest
from app.schemas.application.application_event_create_request import ApplicationEventCreateRequest
from app.schemas.application.application_event_response import ApplicationEventResponse
from app.schemas.application.application_list_item import ApplicationListItem
from app.schemas.application.application_response import ApplicationResponse
from app.schemas.application.application_update_request import ApplicationUpdateRequest
from app.services.application import application_service
from app.services.application.application_service import CompanyNotOwnedError

router = APIRouter()

_NOT_FOUND_DETAIL = "Application not found"


@router.get("/applications")
async def list_applications(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
    company_id: uuid.UUID | None = Query(default=None),
) -> dict:
    """Return the caller's non-deleted applications with latest event status.

    Response shape: ``{"items": [ApplicationListItem...], "total": int}``.
    Each item includes ``latest_status: str | None`` — the ``event_type``
    of the most-recent ``application_events`` row, computed via a correlated
    sub-select on the covering index ``ix_appevent_app_occurred``.  ``None``
    when the application has no events yet.

    Optional ``?company_id=<uuid>`` narrows results to a single company.
    Tenant isolation is preserved — querying with another user's company_id
    returns an empty list, not a 403/404, so no ownership information leaks.
    """
    items = await application_service.list_applications(db, user.id, company_id=company_id)
    return {
        "items": [item.model_dump(mode="json") for item in items],
        "total": len(items),
    }


@router.get("/applications/{application_id}", response_model=ApplicationResponse)
async def get_application(
    application_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ApplicationResponse:
    """Return a single Application iff it belongs to the caller.

    Returns 404 if the application is missing OR belongs to another user —
    callers cannot distinguish the two cases (no existence leak). Soft-deleted
    rows are not visible (the underlying repo filters ``deleted_at IS NULL``).
    """
    application = await application_service.get_application(db, user.id, application_id)
    if application is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return ApplicationResponse.model_validate(application)


@router.post("/applications", response_model=ApplicationResponse, status_code=201)
async def create_application(
    payload: ApplicationCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ApplicationResponse:
    """Create a new Application scoped to the caller.

    HTTP 422 if ``company_id`` does not belong to the caller — the same
    response a malformed body would receive, so cross-tenant probing reveals
    nothing about which companies exist in another user's account.
    """
    try:
        application = await application_service.create_application(db, user.id, payload)
    except CompanyNotOwnedError as exc:
        raise HTTPException(
            status_code=422,
            detail="company_id does not reference an accessible company",
        ) from exc
    return ApplicationResponse.model_validate(application)


@router.patch("/applications/{application_id}", response_model=ApplicationResponse)
async def update_application(
    application_id: uuid.UUID,
    payload: ApplicationUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ApplicationResponse:
    """Apply a partial update to an Application.

    Returns 404 if the application is missing OR belongs to another user —
    callers cannot distinguish the two cases (no existence leak).
    """
    try:
        application = await application_service.update_application(
            db, user.id, application_id, payload,
        )
    except CompanyNotOwnedError as exc:
        raise HTTPException(
            status_code=422,
            detail="company_id does not reference an accessible company",
        ) from exc
    if application is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return ApplicationResponse.model_validate(application)


@router.delete("/applications/{application_id}", status_code=204)
async def delete_application(
    application_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> Response:
    """Soft-delete an Application by setting ``deleted_at``.

    Idempotent — calling DELETE on an already soft-deleted row still returns
    204 as long as the row exists under the caller's ``user_id``. Returns
    404 if the row does not exist or belongs to another user.
    """
    deleted = await application_service.soft_delete_application(db, user.id, application_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return Response(status_code=204)


@router.get("/applications/{application_id}/events")
async def list_application_events(
    application_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> dict:
    """Return events for an application, newest first.

    Returns 404 if the application is missing or belongs to another user
    (no existence leak — same response as a genuine miss). Response
    shape mirrors the list endpoints: ``{"items": [...], "total": int}``.
    """
    events = await application_service.list_application_events(db, user.id, application_id)
    if events is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return {
        "items": [
            ApplicationEventResponse.model_validate(e).model_dump(mode="json") for e in events
        ],
        "total": len(events),
    }


@router.post(
    "/applications/{application_id}/events",
    response_model=ApplicationEventResponse,
    status_code=201,
)
async def create_application_event(
    application_id: uuid.UUID,
    payload: ApplicationEventCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ApplicationEventResponse:
    """Log a new event against an application.

    Returns 404 if the application is missing or belongs to another user.
    422 on schema violations (event_type not in enum, source not in enum,
    extra fields). Idempotency for sync-imported events lives on the
    UNIQUE(user_id, email_message_id) constraint — manual events
    intentionally don't carry email_message_id and so always insert.
    """
    event = await application_service.log_application_event(
        db, user.id, application_id, payload,
    )
    if event is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return ApplicationEventResponse.model_validate(event)
