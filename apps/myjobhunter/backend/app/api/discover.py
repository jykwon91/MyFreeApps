"""HTTP routes for the /discover surface — proactive job discovery.

Endpoints:

- ``POST /discover/sources``                  — create a saved search
- ``GET  /discover/sources``                  — list saved searches
- ``DELETE /discover/sources/{id}``           — deactivate (soft-delete)
- ``POST /discover/sources/{id}/refresh``     — trigger a fetch cycle
- ``GET  /discover``                          — list discovered jobs (inbox view)
- ``POST /discover/{id}/dismiss``             — hide a discovered job
- ``POST /discover/{id}/save``                — keep a discovered job for later

Auth: every endpoint requires an authenticated user via
``current_active_user``. Tenant scoping is mandatory — all queries
filter by ``user_id`` at the repository layer.

Rate-limit: ``POST /discover/sources/{id}/refresh`` calls JSearch which
is paid + per-month-quota. Cap at 30 / 5 min per IP. The other endpoints
are cheap and don't need throttling beyond the global gateway.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.request_utils import get_client_ip

from app.core.auth import current_active_user
from app.core.rate_limit import RateLimiter
from app.db.session import get_db
from app.models.user.user import User
from app.repositories.discovery import discovery_repository
from app.schemas.discovery.discovery_schemas import (
    DiscoveredJobListResponse,
    DiscoveredJobResponse,
    DiscoveryFetchResultResponse,
    DiscoverySourceCreate,
    DiscoverySourceResponse,
)
from app.services.discovery import discovery_fetch_service
from app.services.discovery.discovery_fetch_service import (
    DiscoveryFetchError,
    DiscoverySourceInactiveError,
    DiscoverySourceNotFoundError,
    DiscoveryUnsupportedSourceError,
)
from app.services.discovery.sources.jsearch import (
    JSearchAuthError,
    JSearchInvalidResponseError,
    JSearchTransientError,
)

router = APIRouter(prefix="/discover", tags=["discovery"])

_NOT_FOUND_DETAIL = "Discovery resource not found"

# 30 / 5 min — fetches hit JSearch (paid). Cap is generous for one
# operator running ad-hoc refreshes but limits blast radius if a key
# leaks.
_REFRESH_LIMITER = RateLimiter(max_attempts=30, window_seconds=300)


# ---------------------------------------------------------------------------
# Saved-search CRUD
# ---------------------------------------------------------------------------


@router.post(
    "/sources",
    response_model=DiscoverySourceResponse,
    status_code=201,
)
async def create_source(
    payload: DiscoverySourceCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> DiscoverySourceResponse:
    """Create a new active saved search for the caller."""
    src = await discovery_repository.create_source(
        db,
        user_id=user.id,
        source=payload.source,
        config=payload.config,
        fetch_interval_minutes=payload.fetch_interval_minutes,
    )
    await db.commit()
    await db.refresh(src)
    return DiscoverySourceResponse.model_validate(src)


@router.get(
    "/sources",
    response_model=list[DiscoverySourceResponse],
)
async def list_sources(
    include_inactive: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> list[DiscoverySourceResponse]:
    rows = await discovery_repository.list_sources(
        db, user.id, active_only=not include_inactive,
    )
    return [DiscoverySourceResponse.model_validate(r) for r in rows]


@router.delete(
    "/sources/{source_id}",
    status_code=204,
)
async def deactivate_source(
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> None:
    ok = await discovery_repository.deactivate_source(db, source_id, user.id)
    if not ok:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    await db.commit()


# ---------------------------------------------------------------------------
# Trigger a fetch
# ---------------------------------------------------------------------------


@router.post(
    "/sources/{source_id}/refresh",
    response_model=DiscoveryFetchResultResponse,
    status_code=200,
)
async def refresh_source(
    source_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> DiscoveryFetchResultResponse:
    """Trigger one fetch cycle for the saved search.

    Status codes:
    - 200 — fetch completed (status field tells you success/partial/error)
    - 404 — source not found or doesn't belong to caller
    - 409 — source is deactivated
    - 429 — per-IP rate limit (30 / 5 min)
    - 502 — adapter raised transient error after retries exhausted
    - 503 — JSEARCH_API_KEY not configured (or invalid)
    - 501 — no adapter for this source kind (shouldn't happen; defensive)
    """
    ip = get_client_ip(request)
    if not _REFRESH_LIMITER.allow(ip):
        raise HTTPException(
            status_code=429,
            detail="Refresh rate limit exceeded — try again in a few minutes",
        )

    try:
        result = await discovery_fetch_service.fetch_source(
            db, user.id, source_id,
        )
    except DiscoverySourceNotFoundError:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    except DiscoverySourceInactiveError:
        raise HTTPException(
            status_code=409, detail="Source is deactivated",
        )
    except DiscoveryUnsupportedSourceError as exc:
        raise HTTPException(status_code=501, detail=str(exc))
    except JSearchAuthError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "JSearch API key is not configured or is invalid — "
                "set JSEARCH_API_KEY in the backend environment"
            ),
        ) from exc
    except JSearchTransientError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"JSearch upstream is unavailable: {exc}",
        ) from exc
    except (JSearchInvalidResponseError, DiscoveryFetchError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return DiscoveryFetchResultResponse(**result)


# ---------------------------------------------------------------------------
# Discovered-jobs surface
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=DiscoveredJobListResponse,
)
async def list_discovered(
    state: str = Query(default="inbox", pattern="^(inbox|saved|all)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> DiscoveredJobListResponse:
    rows = await discovery_repository.list_discovered(
        db, user.id, state=state, limit=limit, offset=offset,
    )
    return DiscoveredJobListResponse(
        items=[DiscoveredJobResponse.model_validate(r) for r in rows],
        total=len(rows),
        state=state,
    )


@router.post(
    "/{job_id}/dismiss",
    status_code=204,
)
async def dismiss_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> None:
    ok = await discovery_repository.dismiss_discovered(db, job_id, user.id)
    if not ok:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    await db.commit()


@router.post(
    "/{job_id}/save",
    status_code=204,
)
async def save_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> None:
    ok = await discovery_repository.save_discovered(db, job_id, user.id)
    if not ok:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    await db.commit()
