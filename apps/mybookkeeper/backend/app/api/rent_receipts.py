"""Routes for rent receipt PDF generation and email delivery."""
from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.leases.receipt_period_rules import (
    RECEIPT_PERIOD_ORDER_MESSAGE,
    receipt_period_in_order,
)
from app.schemas.leases.receipt_request import SendReceiptRequest
from app.schemas.leases.receipt_response import (
    PendingReceiptListResponse,
    SendReceiptResponse,
)
from app.services.leases import receipt_send_service, receipt_service
from app.services.leases.exceptions import (
    ReceiptAlreadySentError,
    ReceiptDismissedError,
    ReceiptGmailReauthError,
    ReceiptGmailSendError,
    ReceiptMissingApplicantEmailError,
    ReceiptMissingIntegrationError,
    ReceiptMissingLeaseError,
    ReceiptMissingSendScopeError,
    ReceiptSendInProgressError,
    ReceiptSendUnconfirmedError,
    ReceiptSentFromOtherGmailError,
    ReceiptSentNotRecordedError,
    ReceiptTenantOfOtherMemberError,
    ReceiptTransactionNotAttributedError,
)
from app.services.leases.receipt_send_error_details import (
    RECEIPT_ALREADY_SENT,
    RECEIPT_DISMISSED,
    RECEIPT_GMAIL_REAUTH_REQUIRED,
    RECEIPT_SEND_IN_PROGRESS,
    RECEIPT_SEND_UNCONFIRMED,
    RECEIPT_SENT_FROM_OTHER_GMAIL,
    RECEIPT_SENT_NOT_RECORDED,
)

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
    return await receipt_service.get_pending_receipt_list(
        organization_id=ctx.organization_id,
        user_id=ctx.user_id,
        limit=limit,
        offset=offset,
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
    """Email the tenant a receipt PDF and file it with their lease — at most once.

    409s mean this receipt can't be sent again (already sent, dismissed, or
    another request is sending it). 502 ``receipt_send_unconfirmed`` means
    Gmail may have sent it; retrying later checks Gmail before sending.
    """
    try:
        result = await receipt_send_service.send_receipt(
            transaction_id=transaction_id,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            period_start=body.period_start,
            period_end=body.period_end,
            payment_method=body.payment_method,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ReceiptAlreadySentError as exc:
        raise HTTPException(status_code=409, detail=RECEIPT_ALREADY_SENT) from exc
    except ReceiptSendInProgressError as exc:
        raise HTTPException(status_code=409, detail=RECEIPT_SEND_IN_PROGRESS) from exc
    except ReceiptSentFromOtherGmailError as exc:
        # Kept, not resent: the tenant may have it already. Clients name the
        # account so the host can reconnect it or dismiss the receipt.
        raise HTTPException(
            status_code=409,
            detail={"code": RECEIPT_SENT_FROM_OTHER_GMAIL, "sender_gmail_address": exc.sender_gmail_address},
        ) from exc
    except ReceiptDismissedError as exc:
        raise HTTPException(status_code=409, detail=RECEIPT_DISMISSED) from exc
    except (
        ReceiptTransactionNotAttributedError,
        ReceiptTenantOfOtherMemberError,
        ReceiptMissingApplicantEmailError,
        ReceiptMissingLeaseError,
        ReceiptMissingIntegrationError,
        ReceiptMissingSendScopeError,
    ) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ReceiptGmailReauthError as exc:
        raise HTTPException(status_code=503, detail=RECEIPT_GMAIL_REAUTH_REQUIRED) from exc
    except ReceiptSendUnconfirmedError as exc:
        raise HTTPException(status_code=502, detail=RECEIPT_SEND_UNCONFIRMED) from exc
    except ReceiptGmailSendError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ReceiptSentNotRecordedError as exc:
        raise HTTPException(status_code=500, detail=RECEIPT_SENT_NOT_RECORDED) from exc
    return SendReceiptResponse(
        receipt_number=result.receipt_number,
        attachment_id=result.attachment_id,
    )


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
    except ReceiptSendInProgressError as exc:
        raise HTTPException(status_code=409, detail=RECEIPT_SEND_IN_PROGRESS) from exc
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
    if not receipt_period_in_order(period_start, period_end):
        raise HTTPException(status_code=422, detail=RECEIPT_PERIOD_ORDER_MESSAGE)
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
    except (ReceiptTransactionNotAttributedError, ReceiptTenantOfOtherMemberError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
