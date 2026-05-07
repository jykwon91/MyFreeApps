"""HTTP routes for the Companies domain.

Phase 1 shipped read-only ``GET /companies`` (returning empty items + a
count). Phase 2.2 ships full CRUD. Phase 4.1 adds research endpoints:

  - ``GET /companies`` — returns the caller's companies.
  - ``GET /companies/{id}`` — single resource read.
  - ``POST /companies`` — create.
  - ``PATCH /companies/{id}`` — partial update.
  - ``DELETE /companies/{id}`` — hard delete (no soft-delete for companies).
  - ``GET  /companies/{id}/research`` — latest research record + sources.
  - ``POST /companies/{id}/research`` — trigger (or re-run) research.

Auth: every endpoint requires an authenticated user via
``current_active_user``. Tenant scoping is mandatory — every operation
scopes the query by ``user.id`` so cross-tenant access yields HTTP 404 with
the same body as a genuine miss.

Companies use HARD delete (no ``deleted_at``) per the data model.
"""
from __future__ import annotations

import logging
import uuid

import anthropic
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from app.core.auth import current_active_user
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.company.company_create_request import CompanyCreateRequest
from app.schemas.company.company_research_request import CompanyResearchRequest
from app.schemas.company.company_research_response import CompanyResearchResponse
from app.schemas.company.company_response import CompanyResponse
from app.schemas.company.company_update_request import CompanyUpdateRequest
from app.services.company import company_service
from app.services.company import company_research_service
from app.services.company.company_service import DuplicatePrimaryDomainError
from app.services.integrations.tavily_service import TavilyNotConfiguredError

router = APIRouter()

_NOT_FOUND_DETAIL = "Company not found"
_RESEARCH_NOT_FOUND_DETAIL = "No research has been run for this company yet"


@router.get("/companies")
async def list_companies(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
    name_search: str | None = Query(
        default=None,
        description="Case-insensitive substring filter on company name",
    ),
) -> dict:
    """Return the caller's companies.

    Response shape: ``{"items": [CompanyResponse...], "total": int}``.

    Optional ``?name_search=<string>`` filters by case-insensitive name
    substring.  Empty or whitespace-only values are treated as no filter.
    """
    items = await company_service.list_companies(db, user.id, name_search=name_search)
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


@router.patch("/companies/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: uuid.UUID,
    payload: CompanyUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> CompanyResponse:
    """Apply a partial update to a Company.

    Returns 404 if the company is missing OR belongs to another user —
    callers cannot distinguish the two cases (no existence leak).
    Returns 409 if ``primary_domain`` collides with another of the caller's
    companies (case-insensitive UNIQUE).
    """
    try:
        company = await company_service.update_company(db, user.id, company_id, payload)
    except DuplicatePrimaryDomainError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if company is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return CompanyResponse.model_validate(company)


@router.delete("/companies/{company_id}", status_code=204)
async def delete_company(
    company_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> Response:
    """Hard-delete a Company.

    Returns 404 if the company does not exist or belongs to another user.
    Associated records (linked applications, research) are cascade-deleted
    by the database.
    """
    deleted = await company_service.delete_company(db, user.id, company_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Research sub-resource
# ---------------------------------------------------------------------------


@router.get(
    "/companies/{company_id}/research",
    response_model=CompanyResearchResponse,
    summary="Get latest company research",
)
async def get_company_research(
    company_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> CompanyResearchResponse:
    """Return the most recent research record and its sources for a company.

    Returns 404 when:
    - The company does not exist or belongs to another user.
    - No research has been run for this company yet.

    Use ``POST /companies/{id}/research`` to trigger the first research run.
    """
    research = await company_research_service.get_research(
        db, company_id=company_id, user_id=user.id
    )
    if research is None:
        raise HTTPException(status_code=404, detail=_RESEARCH_NOT_FOUND_DETAIL)
    return CompanyResearchResponse.model_validate(research)


@router.post(
    "/companies/{company_id}/research",
    response_model=CompanyResearchResponse,
    status_code=status.HTTP_200_OK,
    summary="Trigger or re-run company research",
)
async def trigger_company_research(
    company_id: uuid.UUID,
    _payload: CompanyResearchRequest = CompanyResearchRequest(),  # noqa: B008
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> CompanyResearchResponse:
    """Run Tavily + Claude research for a company and return the result.

    This is a synchronous call — it may take 10-30 seconds while we fetch
    search results and synthesise them with Claude. Phase 5 will move this
    to a background queue.

    Returns 404 if the company does not exist or belongs to another user.
    Returns 503 if the Tavily API key is not configured.
    Returns 502 if the Anthropic API call fails.
    Returns 200 with the populated research record on success.
    """
    try:
        research = await company_research_service.run_research(
            db, company_id=company_id, user_id=user.id
        )
    except TavilyNotConfiguredError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Tavily research is not configured: {exc}",
        ) from exc
    except (anthropic.APIError, ValueError) as exc:
        logger.exception(
            "Company research failed: AI synthesis error company_id=%s",
            company_id,
        )
        raise HTTPException(
            status_code=502,
            detail=f"AI synthesis failed: {exc}",
        ) from exc
    except httpx.HTTPStatusError as exc:
        logger.exception(
            "Company research failed: Tavily HTTP %s company_id=%s",
            exc.response.status_code,
            company_id,
        )
        raise HTTPException(
            status_code=502,
            detail=f"Tavily request failed: {exc.response.status_code}",
        ) from exc
    except httpx.RequestError as exc:
        # Covers ConnectError, ReadTimeout, WriteTimeout, ConnectTimeout, etc.
        # (parent of HTTPStatusError so this handler MUST come after the
        # HTTPStatusError handler above.)
        logger.exception(
            "Company research failed: Tavily network error company_id=%s",
            company_id,
        )
        raise HTTPException(
            status_code=504,
            detail=f"Research service network error: {type(exc).__name__}",
        ) from exc
    except Exception as exc:
        # Final safety net — anything else (DB IntegrityError, KeyError,
        # etc.) returned a bare 500 with no detail before. Log + propagate
        # the exception type to the client so the next failure is
        # diagnosable from DevTools alone.
        logger.exception(
            "Company research failed: unexpected error company_id=%s",
            company_id,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Research failed: {type(exc).__name__}: {exc}",
        ) from exc

    if research is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)

    return CompanyResearchResponse.model_validate(research)
