"""HTTP routes for mortgages.

Route prefix: /mortgages.
"""
from __future__ import annotations

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
from app.core.rate_limit import mortgage_statement_extract_limiter
from app.core.upload_errors import upload_error_status
from app.schemas.mortgage.mortgage_create_request import MortgageCreateRequest
from app.schemas.mortgage.mortgage_draft import MortgageDraft
from app.schemas.mortgage.mortgage_extract_request import MortgageExtractRequest
from app.schemas.mortgage.mortgage_list_response import MortgageListResponse
from app.schemas.mortgage.mortgage_response import MortgageResponse
from app.schemas.mortgage.mortgage_update_request import MortgageUpdateRequest
from app.services.mortgage import (
    mortgage_service,
    mortgage_statement_extraction_service,
)

router = APIRouter(prefix="/mortgages", tags=["mortgages"])

_NOT_FOUND_DETAIL = "Mortgage not found"
_DOCUMENT_NOT_FOUND_DETAIL = "Document not found"


@router.post("", response_model=MortgageResponse, status_code=201)
async def create_mortgage(
    payload: MortgageCreateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> MortgageResponse:
    try:
        return await mortgage_service.create_mortgage(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            property_id=payload.property_id,
            rate_type=payload.rate_type,
            source_document_id=payload.source_document_id,
            lender=payload.lender,
            account_number=payload.account_number,
            current_balance_cents=payload.current_balance_cents,
            statement_date=payload.statement_date,
            original_principal_cents=payload.original_principal_cents,
            interest_rate=payload.interest_rate,
            fixed_until=payload.fixed_until,
            maturity_date=payload.maturity_date,
            term_months=payload.term_months,
            monthly_principal_cents=payload.monthly_principal_cents,
            monthly_interest_cents=payload.monthly_interest_cents,
            monthly_escrow_cents=payload.monthly_escrow_cents,
            notes=payload.notes,
        )
    except mortgage_service.InvalidMortgageError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/extract", response_model=MortgageDraft)
async def extract_mortgage_from_document(
    payload: MortgageExtractRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> MortgageDraft:
    """Read loan terms out of a statement the caller already uploaded.

    Nothing is saved — the response prefills the create form, and the operator
    still reviews it. Declared before ``/{mortgage_id}`` so the literal path is
    not swallowed by the UUID route.
    """
    mortgage_statement_extract_limiter.check(f"mortgage-extract:{ctx.user_id}")
    try:
        return await mortgage_statement_extraction_service.extract_mortgage_from_document(
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            document_id=payload.document_id,
        )
    except mortgage_statement_extraction_service.DocumentNotFoundError as exc:
        raise HTTPException(
            status_code=404, detail=_DOCUMENT_NOT_FOUND_DETAIL,
        ) from exc
    except mortgage_statement_extraction_service.UnreadableDocumentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/extract-upload", response_model=MortgageDraft)
async def extract_mortgage_from_upload(
    file: UploadFile = File(...),
    ctx: RequestContext = Depends(require_write_access),
) -> MortgageDraft:
    """Store a statement the caller just picked and read the loan out of it.

    The one-request form of ``/extract``, for callers holding bytes rather than
    a document id. The file is kept as reference material, so no transaction is
    invented from the payment printed on it.
    """
    mortgage_statement_extract_limiter.check(f"mortgage-extract:{ctx.user_id}")
    content = await file.read()
    try:
        return await mortgage_statement_extraction_service.extract_mortgage_from_upload(
            ctx=ctx,
            content=content,
            filename=file.filename or "",
            content_type=file.content_type or "",
        )
    # UnreadableDocumentError is a ValueError, so it has to be caught first or
    # the upload-rejection mapping below would swallow it.
    except mortgage_statement_extraction_service.UnreadableDocumentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        msg = str(exc)
        raise HTTPException(
            status_code=upload_error_status(msg), detail=msg,
        ) from exc


@router.get("", response_model=MortgageListResponse)
async def list_mortgages(
    property_id: uuid.UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    ctx: RequestContext = Depends(current_org_member),
) -> MortgageListResponse:
    return await mortgage_service.list_mortgages(
        user_id=ctx.user_id,
        organization_id=ctx.organization_id,
        property_id=property_id,
        limit=limit,
        offset=offset,
    )


@router.get("/{mortgage_id}", response_model=MortgageResponse)
async def get_mortgage(
    mortgage_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> MortgageResponse:
    try:
        return await mortgage_service.get_mortgage(
            mortgage_id=mortgage_id,
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
        )
    except mortgage_service.MortgageNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc


@router.patch("/{mortgage_id}", response_model=MortgageResponse)
async def update_mortgage(
    mortgage_id: uuid.UUID,
    payload: MortgageUpdateRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> MortgageResponse:
    # ``exclude_unset`` preserves the distinction between "field omitted" and
    # "field explicitly set to null" — clearing a value is a real edit here.
    fields: dict[str, Any] = payload.model_dump(exclude_unset=True)
    try:
        if not fields:
            return await mortgage_service.get_mortgage(
                mortgage_id=mortgage_id,
                user_id=ctx.user_id,
                organization_id=ctx.organization_id,
            )
        return await mortgage_service.update_mortgage(
            mortgage_id=mortgage_id,
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            fields=fields,
        )
    except mortgage_service.MortgageNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc
    except mortgage_service.InvalidMortgageError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/{mortgage_id}", status_code=204)
async def delete_mortgage(
    mortgage_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> Response:
    try:
        await mortgage_service.delete_mortgage(
            mortgage_id=mortgage_id,
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
        )
    except mortgage_service.MortgageNotFoundError as exc:
        raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL) from exc
    return Response(status_code=204)
