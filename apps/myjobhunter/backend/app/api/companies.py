"""HTTP routes for the Companies domain.

Phase 1 shipped read-only ``GET /companies`` (returning empty items + a
count). Phase 2.2 (this file) ships:

  - ``GET /companies`` — now actually returns the items.
  - ``GET /companies/{id}`` — single resource read.
  - ``POST /companies`` — create.

Auth: every endpoint requires an authenticated user via
``current_active_user``. Tenant scoping is mandatory — every operation
scopes the query by ``user.id`` so cross-tenant access yields HTTP 404 with
the same body as a genuine miss.

Companies use HARD delete (no ``deleted_at``) per the data model.
DELETE / PATCH are deferred to a follow-up PR; the AddApplicationDialog
flow only needs create + list to function.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.company.company_create_request import CompanyCreateRequest
from app.schemas.company.company_response import CompanyResponse
from app.services.company import company_service
from app.services.company.company_service import DuplicatePrimaryDomainError

router = APIRouter()

_NOT_FOUND_DETAIL = "Company not found"


@router.get("/companies")
async def list_companies(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> dict:
    """Return the caller's companies.

    Response shape: ``{"items": [CompanyResponse...], "total": int}``.
    Phase 1 returned ``items: []``; this PR populates ``items``.
    """
    items = await company_service.list_companies(db, user.id)
    return {
        "items": [CompanyResponse.model_validate(c).model_dump(mode="json") for c in items],
        "total": len(items),
    }


@router.get("/companies/{company_id}", response_model=CompanyResponse)
async def get_company(
    company_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> CompanyResponse:
    """Return a single Company iff it belongs to the caller."""
    company = await company_service.get_company(db, user.id, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return CompanyResponse.model_validate(company)


@router.post("/companies", response_model=CompanyResponse, status_code=201)
async def create_company(
    payload: CompanyCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> CompanyResponse:
    """Create a new Company scoped to the caller.

    Returns HTTP 409 if ``primary_domain`` collides with the caller's
    existing companies (case-insensitive UNIQUE). All other validation
    failures surface as HTTP 422 via the Pydantic schema.
    """
    try:
        company = await company_service.create_company(db, user.id, payload)
    except DuplicatePrimaryDomainError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return CompanyResponse.model_validate(company)


@router.get("/companies/{company_id}/research")
async def get_company_research(
    company_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> dict:
    research = await company_service.get_company_research(db, company_id, user.id)
    if research is None:
        raise HTTPException(status_code=404, detail="Research not found")
    return {"research": {"id": str(research.id)}}
