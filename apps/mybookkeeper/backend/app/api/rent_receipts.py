"""Routes for rent receipt PDF generation and email delivery."""
from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.leases.receipt_request import SendReceiptRequest
from app.schemas.leases.receipt_response import (
    PendingReceiptListResponse,
    PendingReceiptResponse,
    SendReceiptResponse,
)
from app.services.leases import receipt_service

router = APIRouter(tags=["rent-receipts"])


@router.get(
    "/rent-receipts/pending",
    response_model=PendingReceiptListResponse,
)
async def list_pending_receipts(
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    ctx: RequestContext = Depends(current_org_member),
) -> PendingReceiptListResponse:
    items = await receipt_service.list_pending_receipts(
        organization_id=ctx.organization_id,
        limit=limit,
        offset=offset,
    )
    pending_count = await receipt_service.count_pending_receipts(ctx.organization_id)
    return PendingReceiptListResponse(
        items=[PendingReceiptResponse.model_validate(r) for r in items],
        total=len(items),
        pending_count=pending_count,
    )


@router.post(
    "/rent-receipts/{transaction_id}/send",
    response_model=SendReceiptResponse,
)
async def send_receipt(
    transaction_id: uuid.UUID,
    body: SendReceiptRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> SendReceiptResponse:
    """Generate a receipt PDF, email it to the tenant, and save it as a lease attachment."""
    try:
        result = await receipt_service.send_receipt(
            transaction_id=transaction_id,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            period_start=body.period_start,
            period_end=body.period_end,
            payment_method=body.payment_method,
        )
        return SendReceiptResponse(
            receipt_number=result.receipt_number,
            attachment_id=result.attachment_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except receipt_service.ReceiptTransactionNotAttributedError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except receipt_service.ReceiptMissingApplicantEmailError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except receipt_service.ReceiptMissingIntegrationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except receipt_service.ReceiptMissingSendScopeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except receipt_service.ReceiptGmailReauthError as exc:
        raise HTTPException(status_code=503, detail="gmail_reauth_required") from exc
    except receipt_service.ReceiptGmailSendError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post(
    "/rent-receipts/{transaction_id}/dismiss",
    status_code=204,
)
async def dismiss_receipt(
    transaction_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> None:
    """Dismiss a pending receipt without sending it."""
    try:
        await receipt_service.dismiss_pending_receipt(
            transaction_id=transaction_id,
            organization_id=ctx.organization_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get(
    "/rent-receipts/preview/{transaction_id}",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
async def preview_receipt(
    transaction_id: uuid.UUID,
    period_start: date = Query(...),
    period_end: date = Query(...),
    payment_method: str | None = Query(default=None),
    ctx: RequestContext = Depends(current_org_member),
) -> Response:
    """Return a preview PDF without saving or sending."""
    try:
        pdf_bytes, filename = await receipt_service.preview_receipt_pdf(
            transaction_id=transaction_id,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            period_start=period_start,
            period_end=period_end,
            payment_method=payment_method,
        )
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="{filename}"',
                "Content-Length": str(len(pdf_bytes)),
            },
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except receipt_service.ReceiptTransactionNotAttributedError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
