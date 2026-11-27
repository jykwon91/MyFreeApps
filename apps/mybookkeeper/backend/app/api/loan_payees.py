"""Count a transaction's payee as a mortgage or a loan."""
import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.core.context import RequestContext
from app.core.permissions import current_org_member, require_write_access
from app.schemas.transactions.loan_payee_read import LoanPayeeRead
from app.schemas.transactions.loan_payee_request import LoanPayeeRequest
from app.services.transactions import loan_payee_service
from app.services.transactions.loan_payee_service import NotALoanPaymentError, TransactionNotFoundError

router = APIRouter(tags=["loan-payees"])


@router.get("/transactions/{transaction_id}/loan-payee", response_model=LoanPayeeRead)
async def get_loan_payee(
    transaction_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> LoanPayeeRead:
    try:
        return await loan_payee_service.get_for_transaction(
            transaction_id=transaction_id, organization_id=ctx.organization_id,
        )
    except TransactionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# PUT: tagging twice is the same as tagging once, so a double click is harmless.
@router.put("/transactions/{transaction_id}/loan-payee", response_model=LoanPayeeRead)
async def tag_loan_payee(
    transaction_id: uuid.UUID,
    body: LoanPayeeRequest,
    ctx: RequestContext = Depends(require_write_access),
) -> LoanPayeeRead:
    try:
        return await loan_payee_service.tag(
            transaction_id=transaction_id,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            kind=body.kind,
        )
    except TransactionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except NotALoanPaymentError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.delete("/transactions/{transaction_id}/loan-payee", response_model=LoanPayeeRead)
async def untag_loan_payee(
    transaction_id: uuid.UUID,
    ctx: RequestContext = Depends(require_write_access),
) -> LoanPayeeRead:
    try:
        return await loan_payee_service.untag(transaction_id=transaction_id, organization_id=ctx.organization_id)
    except TransactionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
