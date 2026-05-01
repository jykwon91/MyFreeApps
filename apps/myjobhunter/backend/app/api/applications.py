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

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.application.application_create_request import ApplicationCreateRequest
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
) -> dict:
    """Return the caller's non-deleted applications.

    Phase 1 shape preserved — ``items`` is intentionally an empty list with
    ``total`` carrying the count, matching the existing tenant-isolation
    smoke contract. Full pagination + summary projection ships in PR 2.1b
    once the kanban frontend lands.
    """
    items = await application_service.list_applications(db, user.id)
    return {"items": [], "total": len(items)}


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
