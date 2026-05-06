"""HTTP routes for the Analyze-a-job feature.

Two endpoints:

- ``POST /jobs/analyze`` — runs a fit analysis. Either a URL or pasted
  text is accepted (exactly one). Returns the persisted JobAnalysis row.
- ``POST /jobs/analyze/{id}/apply`` — converts a stored analysis into a
  tracked Application. Idempotent — a second call returns the existing
  application instead of creating a duplicate.

Auth: every endpoint requires an authenticated user via
``current_active_user``. Tenant scoping is mandatory.

Audit: writes are captured automatically by the shared SQLAlchemy
``after_flush`` listener registered in ``app.main`` lifespan.

Pattern reference: applications.py (the existing CRUD surface) — same
404-on-cross-tenant policy, explicit-commit semantics, and per-IP rate
limiter pattern.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.core.request_utils import get_client_ip

from app.core.auth import current_active_user
from app.core.rate_limit import RateLimiter
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.application.application_response import ApplicationResponse
from app.schemas.job_analysis.job_analysis_request import JobAnalysisRequest
from app.schemas.job_analysis.job_analysis_response import JobAnalysisResponse
from app.services.job_analysis import job_analysis_service
from app.services.job_analysis.job_analysis_service import (
    JobAnalysisError,
    JobAnalysisFetchAuthRequiredError,
    JobAnalysisFetchTimeoutError,
    JobAnalysisInvalidUrlError,
)

router = APIRouter()

_NOT_FOUND_DETAIL = "Job analysis not found"

# 30 / 5 min — analysis is more expensive than the existing extract +
# parse endpoints. The cap is generous for a legitimate operator (one
# analysis per role across a hunting session) but tight enough to
# limit blast radius if a key leaks.
_ANALYZE_LIMITER = RateLimiter(max_attempts=30, window_seconds=300)


@router.post(
    "/jobs/analyze",
    response_model=JobAnalysisResponse,
    status_code=201,
)
async def analyze_job(
    payload: JobAnalysisRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> JobAnalysisResponse:
    """Run a fit analysis for the caller against the supplied job.

    Body must contain exactly one of ``url`` / ``jd_text`` (the schema
    validator rejects both-or-neither at 422 before the route runs).

    Status codes:
    - 201 — analysis persisted; body is a :class:`JobAnalysisResponse`
    - 400 — URL malformed
    - 422 — request body failed schema validation, OR URL was auth-walled
            (LinkedIn / Glassdoor) and the operator should switch to
            text-paste
    - 429 — per-IP rate limit exceeded (30 / 5 minutes)
    - 502 — Claude failed or returned malformed JSON
    - 504 — upstream URL fetch timed out
    """
    _ANALYZE_LIMITER.check(get_client_ip(request))

    url = str(payload.url) if payload.url is not None else None
    jd_text = payload.jd_text

    try:
        analysis = await job_analysis_service.analyze(
            db, user.id, url=url, jd_text=jd_text,
        )
    except JobAnalysisInvalidUrlError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except JobAnalysisFetchAuthRequiredError as exc:
        # 422 with a stable detail literal so the SPA can route on it
        # deterministically (matches the auth_required convention used
        # by /applications/extract-from-url).
        raise HTTPException(status_code=422, detail="auth_required") from exc
    except JobAnalysisFetchTimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail=f"Timed out fetching URL: {exc}",
        ) from exc
    except JobAnalysisError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Couldn't analyze this job: {exc}",
        ) from exc

    return JobAnalysisResponse.model_validate(analysis)


@router.get(
    "/jobs/analyze/{analysis_id}",
    response_model=JobAnalysisResponse,
)
async def get_job_analysis(
    analysis_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> JobAnalysisResponse:
    """Fetch a single analysis by id. 404 on cross-tenant or missing."""
    analysis = await job_analysis_service.get_analysis(db, user.id, analysis_id)
    if analysis is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return JobAnalysisResponse.model_validate(analysis)


@router.post(
    "/jobs/analyze/{analysis_id}/apply",
    response_model=ApplicationResponse,
    status_code=201,
)
async def apply_from_analysis(
    analysis_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) -> ApplicationResponse:
    """Create an Application from a stored analysis.

    Idempotent — calling twice returns the same Application without
    creating a duplicate. Uses the analysis's extracted fields to
    populate the Application's role title, salary, location, remote
    type, and JD text. Auto-creates a Company by name if one doesn't
    already exist under the caller's account.

    Returns 404 if the analysis is missing or belongs to another
    user — same response either way (no existence leak).
    """
    application = await job_analysis_service.apply_to_application(
        db, user.id, analysis_id,
    )
    if application is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)
    return ApplicationResponse.model_validate(application)
