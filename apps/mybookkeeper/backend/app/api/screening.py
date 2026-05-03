"""HTTP routes for the screening sub-domain (rentals Phase 3, PR 3.3 + scrnv2260503).

Mounted under ``/applicants/{applicant_id}/screening`` in main.py — kept in
its own module to keep ``api/applicants.py`` focused on the parent CRUD.

Auth: read endpoints use ``current_org_member`` (any org member can read);
write endpoint uses ``require_write_access`` so VIEWER members are blocked
with HTTP 403 — matches the listings + applicants + vendors conventions.

Audit: ``screening.redirect_initiated`` and ``screening.result_uploaded``
events are emitted via the service layer to ``audit_logs`` (a semantic
event row alongside the per-column INSERT rows the SQLAlchemy listener
captures automatically).

New endpoints (scrnv2260503 UX rebuild):
  GET  /{id}/screening/eligibility — returns eligibility gate fields
  GET  /{id}/screening/providers   — returns static provider grid metadata
"""
from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.core.config import settings
from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.applicants.screening_eligibility_response import (
    ScreeningEligibilityResponse,
)
from app.schemas.applicants.screening_provider_response import (
    ScreeningProvidersResponse,
)
from app.schemas.applicants.screening_redirect_response import (
    ScreeningRedirectResponse,
)
from app.schemas.applicants.screening_result_response import ScreeningResultResponse
from app.services import screening as screening_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/applicants", tags=["applicants"])


@router.get(
    "/{applicant_id}/screening/eligibility",
    response_model=ScreeningEligibilityResponse,
)
async def get_screening_eligibility(
    applicant_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> ScreeningEligibilityResponse:
    """Check whether this applicant can be screened and if a result is pending.

    Returns:
        eligible: True iff name + contact are present.
        missing_fields: human-readable list of what's missing.
        has_pending: True iff a "pending" screening result is in flight.

    Returns 404 when the applicant doesn't exist in the calling tenant.
    """
    try:
        return await screening_service.get_eligibility(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            applicant_id=applicant_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Applicant not found") from exc


@router.get(
    "/{applicant_id}/screening/providers",
    response_model=ScreeningProvidersResponse,
)
async def list_screening_providers(
    applicant_id: uuid.UUID,  # noqa: ARG001 — path param kept for consistency
    ctx: RequestContext = Depends(current_org_member),  # noqa: ARG001
) -> ScreeningProvidersResponse:
    """Return the static provider grid metadata.

    The applicant_id path param is accepted for URL consistency but the
    response is not per-applicant — all applicants see the same provider
    grid. Auth is still required (any org member can read).
    """
    return screening_service.list_providers()


@router.get(
    "/{applicant_id}/screening/redirect",
    response_model=ScreeningRedirectResponse,
)
async def initiate_screening_redirect(
    applicant_id: uuid.UUID,
    provider: str = "keycheck",
    ctx: RequestContext = Depends(current_org_member),
) -> ScreeningRedirectResponse:
    """Resolve the provider dashboard URL the host should be redirected to.

    Query params:
        provider: screening provider name (default "keycheck"). Must be one
                  of the registered providers; 400 on unknown value.

    Returns 404 when the applicant doesn't exist in the calling tenant.
    The host opens the URL in a new tab, completes the screening on the
    provider's site, then uploads the resulting PDF via the upload endpoint.
    """
    try:
        url, provider_name = await screening_service.initiate_redirect(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            applicant_id=applicant_id,
            provider_name=provider,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Applicant not found") from exc
    except screening_service.UnknownProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ScreeningRedirectResponse(redirect_url=url, provider=provider_name)


@router.post(
    "/{applicant_id}/screening/upload-result",
    response_model=ScreeningResultResponse,
    status_code=201,
)
async def upload_screening_result(
    applicant_id: uuid.UUID,
    file: UploadFile = File(...),
    status: str = Form(...),
    adverse_action_snippet: str | None = Form(default=None),
    ctx: RequestContext = Depends(require_write_access),
) -> ScreeningResultResponse:
    """Upload the completed KeyCheck report and the host's outcome decision.

    Multipart fields:
        file: the report PDF (or screenshot — defensive image handling)
        status: one of pending, pass, fail, inconclusive
        adverse_action_snippet: required when status is fail / inconclusive

    Errors:
        404 — applicant not in calling tenant
        413 — file exceeds size cap
        415 — file failed safety pipeline (content sniff, virus scan, etc.)
        422 — bad status or missing snippet on adverse outcome
        503 — storage backend unavailable
    """
    content = await file.read()
    if len(content) > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {settings.max_upload_size_bytes // (1024 * 1024)}MB limit",
        )

    try:
        return await screening_service.record_result(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            applicant_id=applicant_id,
            file_content=content,
            declared_content_type=file.content_type,
            status=status,
            adverse_action_snippet=adverse_action_snippet,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Applicant not found") from exc
    except screening_service.ScreeningUploadValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except screening_service.UnknownProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except screening_service.ScreeningServiceError as exc:
        # Includes StorageNotConfiguredError → 503.
        if "storage" in str(exc).lower():
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        # Defer to the report-processor exception class via duck typing —
        # importing the class here would create a circular import surface.
        cls_name = type(exc).__name__
        if cls_name in {"ReportRejected", "VirusFound"}:
            reason = getattr(exc, "reason", str(exc))
            status_code = 413 if reason.startswith("file exceeds") else 415
            raise HTTPException(status_code=status_code, detail=reason) from exc
        raise


@router.get(
    "/{applicant_id}/screening",
    response_model=list[ScreeningResultResponse],
)
async def list_screening_results(
    applicant_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> list[ScreeningResultResponse]:
    """Return every screening result for an applicant, newest-uploaded first.

    Each row includes a short-lived presigned download URL when storage is
    configured. Returns 404 when the applicant doesn't exist in the calling
    tenant.
    """
    try:
        return await screening_service.list_results(
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            applicant_id=applicant_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Applicant not found") from exc
