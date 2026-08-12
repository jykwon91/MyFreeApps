"""HTTP routes for utility plans.

Route prefix: /utility-plans.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
)

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.core.power_to_choose_constants import DEFAULT_MIN_TERM_MONTHS
from app.core.rate_limit import (
    utility_offer_search_limiter,
    utility_plan_extract_limiter,
)
from app.core.upload_errors import upload_error_status
from app.core.utility_plan_constants import EXPIRING_SOON_DAYS
from app.schemas.properties.utility_plan_create_request import UtilityPlanCreateRequest
from app.schemas.properties.utility_offer_search_response import (
    UtilityOfferSearchResponse,
)
from app.schemas.properties.utility_plan_draft import UtilityPlanDraft
from app.schemas.properties.utility_plan_extract_request import UtilityPlanExtractRequest
from app.schemas.properties.utility_plan_list_response import UtilityPlanListResponse
from app.schemas.properties.utility_plan_rate_comparison_response import (
    UtilityPlanRateComparisonResponse,
)
from app.schemas.properties.utility_plan_renewal_alert_response import (
    UtilityPlanRenewalAlertResponse,
)
from app.schemas.properties.utility_plan_response import UtilityPlanResponse
from app.schemas.properties.utility_plan_update_request import UtilityPlanUpdateRequest
from app.services.properties import (
    market_rate_benchmark_service,
    utility_offer_service,
    utility_plan_extraction_service,
    utility_plan_service,
)

router = APIRouter(prefix="/utility-plans", tags=["utility-plans"])

_NOT_FOUND_DETAIL = "Utility plan not found"
_DOCUMENT_NOT_FOUND_DETAIL = "Document not found"


@router.post("", response_model=UtilityPlanResponse, status_code=201)
async def create_plan(
    payload: UtilityPlanCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> UtilityPlanResponse:
    try:
        return await utility_plan_service.create_plan(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            fields=payload.model_dump(),
        )
    except utility_plan_service.InvalidUtilityPlanError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/extract", response_model=UtilityPlanDraft)
async def extract_plan_from_document(
    payload: UtilityPlanExtractRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> UtilityPlanDraft:
    """Read plan terms out of a document the caller already uploaded.

    Nothing is saved — the response prefills the create form, and the operator
    still reviews it. Declared before ``/{plan_id}`` so the literal path is not
    swallowed by the UUID route.
    """
    utility_plan_extract_limiter.check(f"utility-plan-extract:{ctx.user_id}")
    try:
        return await utility_plan_extraction_service.extract_plan_from_document(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            document_id=payload.document_id,
        )
    except utility_plan_extraction_service.DocumentNotFoundError as exc:
        raise HTTPException(
            status_code=404, detail=_DOCUMENT_NOT_FOUND_DETAIL,
        ) from exc
    except utility_plan_extraction_service.UnreadableDocumentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/extract-upload", response_model=UtilityPlanDraft)
async def extract_plan_from_upload(
    file: UploadFile = File(...),
    ctx: RequestContext = Depends(require_write_access),
) -> UtilityPlanDraft:
    """Store a file the caller just picked and read plan terms out of it.

    The one-request form of ``/extract``, for callers holding bytes rather than
    a document id — a phone photographing an Electricity Facts Label has nothing
    in the library to point at. The file is kept as reference material, so no
    transaction is invented from it. No plan is saved; the response prefills the
    create form. Declared before ``/{plan_id}`` so the literal path is not
    swallowed by the UUID route.
    """
    utility_plan_extract_limiter.check(f"utility-plan-extract:{ctx.user_id}")
    content = await file.read()
    try:
        return await utility_plan_extraction_service.extract_plan_from_upload(
            ctx=ctx,
            content=content,
            filename=file.filename or "",
            content_type=file.content_type or "",
        )
    # UnreadableDocumentError is a ValueError, so it has to be caught first or
    # the upload-rejection mapping below would swallow it.
    except utility_plan_extraction_service.UnreadableDocumentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        msg = str(exc)
        raise HTTPException(
            status_code=upload_error_status(msg), detail=msg,
        ) from exc


@router.get("", response_model=UtilityPlanListResponse)
async def list_plans(
    property_id: uuid.UUID | None = Query(None),
    service_type: str | None = Query(None),
    expiring_before: _dt.date | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    ctx: RequestContext = Depends(current_org_member),
) -> UtilityPlanListResponse:
    return await utility_plan_service.list_plans(
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
        property_id=property_id,
        service_type=service_type,
        expiring_before=expiring_before,
        limit=limit,
        offset=offset,
    )


@router.get("/renewal-alerts", response_model=UtilityPlanRenewalAlertResponse)
async def get_renewal_alerts(
    window_days: int = Query(EXPIRING_SOON_DAYS, ge=1, le=365),
    ctx: RequestContext = Depends(current_org_member),
) -> UtilityPlanRenewalAlertResponse:
    """Current plans whose term has lapsed or lapses within ``window_days``.

    Declared before ``/{plan_id}`` so the literal path is not swallowed by the
    UUID route.
    """
    return await utility_plan_service.get_renewal_alerts(
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
        window_days=window_days,
    )


@router.get("/rate-comparison", response_model=UtilityPlanRateComparisonResponse)
async def get_rate_comparison(
    ctx: RequestContext = Depends(current_org_member),
) -> UtilityPlanRateComparisonResponse:
    """Current plans priced materially above the recorded market benchmark.

    Lives on the plan resource rather than the benchmark one because it returns
    plans. Declared before ``/{plan_id}`` so the literal path is not swallowed
    by the UUID route.
    """
    return await market_rate_benchmark_service.get_rate_comparison(
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
    )


@router.get("/offers", response_model=UtilityOfferSearchResponse)
async def find_better_plans(
    min_term_months: int = Query(DEFAULT_MIN_TERM_MONTHS, ge=1, le=60),
    ctx: RequestContext = Depends(current_org_member),
) -> UtilityOfferSearchResponse:
    """Live market offers ranked against each property's current electricity plan.

    Reads the Power to Choose feed; persists nothing. Declared before
    ``/{plan_id}`` so the literal path is not swallowed by the UUID route.
    """
    utility_offer_search_limiter.check(f"utility-offer-search:{ctx.user_id}")
    return await utility_offer_service.find_better_plans(
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
        min_term_months=min_term_months,
    )


@router.get("/{plan_id}", response_model=UtilityPlanResponse)
async def get_plan(
    plan_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> UtilityPlanResponse:
    try:
        return await utility_plan_service.get_plan(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            plan_id=plan_id,
        )
    except utility_plan_service.UtilityPlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc


@router.patch("/{plan_id}", response_model=UtilityPlanResponse)
async def update_plan(
    plan_id: uuid.UUID,
    payload: UtilityPlanUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> UtilityPlanResponse:
    # exclude_unset preserves the distinction between "field omitted" and
    # "field explicitly set to null".
    raw: dict[str, Any] = payload.model_dump(exclude_unset=True)
    if not raw:
        try:
            return await utility_plan_service.get_plan(
                user_id=ctx.user_id,
                organization_id=ctx.organization_id,
                plan_id=plan_id,
            )
        except utility_plan_service.UtilityPlanNotFoundError as exc:
            raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc

    try:
        return await utility_plan_service.update_plan(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            plan_id=plan_id,
            fields=raw,
        )
    except utility_plan_service.UtilityPlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc
    except utility_plan_service.InvalidUtilityPlanError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/{plan_id}", status_code=204)
async def delete_plan(
    plan_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await utility_plan_service.soft_delete_plan(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            plan_id=plan_id,
        )
    except utility_plan_service.UtilityPlanNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc
    return Response(status_code=204)
