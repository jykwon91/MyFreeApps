"""Mark a transaction a personal transfer, and the senders remembered for it."""
import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.transactions.personal_transfer_mark_result import PersonalTransferMarkResult
from app.schemas.transactions.personal_transfer_sender_read import PersonalTransferSenderRead
from app.schemas.transactions.personal_transfer_unmark_request import PersonalTransferUnmarkRequest
from app.schemas.transactions.personal_transfer_unmark_result import PersonalTransferUnmarkResult
from app.services.transactions import personal_transfer_service

router = APIRouter(tags=["personal-transfers"])


def _http_error(error: ValueError) -> HTTPException:
    detail = str(error)
    return HTTPException(status_code=404 if "not found" in detail.lower() else 422, detail=detail)


# PUT, not POST: marking twice is the same as marking once, so a double click is harmless.
@router.put("/transactions/{transaction_id}/personal-transfer", response_model=PersonalTransferMarkResult)
async def mark_personal_transfer(
    transaction_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> PersonalTransferMarkResult:
    try:
        return await personal_transfer_service.mark(
            transaction_id=transaction_id, organization_id=ctx.organization_id, user_id=ctx.user_id,
        )
    except ValueError as e:
        raise _http_error(e)


# POST rather than DELETE: it carries a body (whether to forget the sender too).
@router.post(
    "/transactions/{transaction_id}/personal-transfer/undo", response_model=PersonalTransferUnmarkResult,
)
async def unmark_personal_transfer(
    transaction_id: uuid.UUID,
    body: PersonalTransferUnmarkRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> PersonalTransferUnmarkResult:
    try:
        return await personal_transfer_service.unmark(
            transaction_id=transaction_id,
            organization_id=ctx.organization_id,
            forget_sender=body.forget_sender,
        )
    except ValueError as e:
        raise _http_error(e)


@router.get("/personal-transfer-senders", response_model=list[PersonalTransferSenderRead])
async def list_personal_transfer_senders(
    ctx: RequestContext = Depends(current_org_member),
) -> list[PersonalTransferSenderRead]:
    return await personal_transfer_service.list_senders(ctx.organization_id)


@router.delete("/personal-transfer-senders/{sender_id}", status_code=204)
async def forget_personal_transfer_sender(
    sender_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> None:
    if not await personal_transfer_service.forget_sender(sender_id=sender_id, organization_id=ctx.organization_id):
        raise HTTPException(status_code=404, detail="Sender not found")
