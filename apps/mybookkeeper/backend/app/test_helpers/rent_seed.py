"""Test-only seed helpers for the rent ledger.

Lives beside ``seed.py`` rather than inside it: that module is already past the
1000-LOC guard, and rent fixtures are a self-contained concern.

The one thing these helpers exist for is a payment history the ledger can
actually be exercised against — a tenant charged monthly who pays weekly needs
four or five dated payments before "how much has been paid this month" means
anything.
"""

import datetime as _dt
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete as _sa_delete

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.db.session import unit_of_work
from app.models.transactions.transaction import Transaction
from app.repositories import applicant_repo, transaction_repo
from app.test_helpers.auth import _require_test_mode

router = APIRouter()


class _SeedTenantPaymentsRequest(BaseModel):
    model_config = {"extra": "forbid"}

    applicant_id: uuid.UUID
    # Dates the tenant paid, oldest first. One transaction per entry.
    paid_on: list[_dt.date] = Field(min_length=1, max_length=52)
    amount: Decimal = Decimal("375.00")
    payer_name: str | None = None
    category: str = "rental_revenue"


class _SeedTenantPaymentsResponse(BaseModel):
    transaction_ids: list[uuid.UUID]


@router.post(
    "/test/seed-tenant-payments",
    response_model=_SeedTenantPaymentsResponse,
    status_code=201,
)
async def seed_tenant_payments(
    payload: _SeedTenantPaymentsRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> _SeedTenantPaymentsResponse:
    """Attach dated, attributed income transactions to an existing applicant.

    ``category`` is a parameter so a test can seed a ``security_deposit`` and
    assert that it does *not* settle rent — the exclusion is a rule worth
    exercising, not an implementation detail.
    """
    _require_test_mode()

    transaction_ids: list[uuid.UUID] = []
    async with unit_of_work() as db:
        applicant = await applicant_repo.get(
            db,
            applicant_id=payload.applicant_id,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
        )
        if applicant is None:
            raise HTTPException(status_code=404, detail="Applicant not found")

        payer = payload.payer_name or applicant.legal_name or "E2E Tenant"
        for paid_on in payload.paid_on:
            txn = await transaction_repo.create_transaction(
                db,
                organization_id=ctx.organization_id,
                user_id=ctx.user_id,
                is_manual=True,
                transaction_date=paid_on,
                tax_year=paid_on.year,
                vendor=payer,
                payer_name=payer,
                amount=payload.amount,
                transaction_type="income",
                category=payload.category,
                applicant_id=payload.applicant_id,
                attribution_source="auto_exact",
                status="approved",
            )
            transaction_ids.append(txn.id)

    return _SeedTenantPaymentsResponse(transaction_ids=transaction_ids)


@router.delete("/test/tenant-payments/{transaction_id}", status_code=204)
async def delete_tenant_payment(
    transaction_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Hard-delete a seeded payment.

    ``transactions.applicant_id`` is ``ON DELETE SET NULL``, so deleting the
    applicant leaves these rows behind — the E2E suite has to clear them
    explicitly or every run adds permanent income to the dev database.
    """
    _require_test_mode()
    async with unit_of_work() as db:
        await db.execute(
            _sa_delete(Transaction).where(
                Transaction.id == transaction_id,
                Transaction.organization_id == ctx.organization_id,
            ),
        )
