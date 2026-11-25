"""Test-only seed + cleanup for Payment Review (attribution review queue) rows.

Lives beside ``seed.py`` rather than inside it: that module is past the
file-size guard, and review-queue fixtures are a self-contained concern.
"""

import datetime as _dt
import uuid
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.db.session import unit_of_work
from app.repositories import transaction_repo
from app.repositories.properties import property_repo
from app.repositories.transactions import attribution_repo
from app.test_helpers.auth import _require_test_mode

router = APIRouter()


class _SeedAttributionReviewRequest(BaseModel):
    model_config = {"extra": "forbid"}

    # ``None`` seeds a rent (tenant-shaped) row; an OTA channel string
    # seeds a property-shaped payout row. Constrained to the same domain as
    # the transactions.channel CHECK constraint so a bad value is a clean
    # 422, not a DB IntegrityError.
    channel: Literal["airbnb", "vrbo", "booking.com", "direct"] | None = "airbnb"
    amount: Decimal = Decimal("920.00")
    transaction_date: _dt.date | None = None
    description: str | None = None
    confidence: Literal["fuzzy", "unmatched"] = "unmatched"
    proposed_property_id: uuid.UUID | None = None
    # The sender as the bank showed it, so a personal-transfer test has someone to remember.
    payer_name: str | None = None


class _SeedAttributionReviewResponse(BaseModel):
    id: uuid.UUID
    transaction_id: uuid.UUID


@router.post(
    "/test/seed-attribution-review",
    response_model=_SeedAttributionReviewResponse,
    status_code=201,
)
async def seed_attribution_review(
    payload: _SeedAttributionReviewRequest,
    ctx: RequestContext = Depends(current_org_member),
) -> _SeedAttributionReviewResponse:
    """Test-only: create a pending Airbnb-payout attribution-review row.

    Production rows land here from the email-extraction → ``attribution_service``
    pipeline; this seed bypasses Gmail + Claude so ``attribution-review.spec.ts``
    can exercise the full review-UX → confirm → ``transactions.property_id``
    flow deterministically. Gated by ``ALLOW_TEST_ADMIN_PROMOTION``.
    """
    _require_test_mode()
    txn_date = payload.transaction_date or _dt.datetime.now(_dt.timezone.utc).date()
    async with unit_of_work() as db:
        if payload.proposed_property_id is not None:
            prop = await property_repo.get_by_id(
                db, payload.proposed_property_id, ctx.organization_id
            )
            if prop is None:
                raise HTTPException(status_code=404, detail="Property not found")
        txn = await transaction_repo.create_transaction(
            db,
            organization_id=ctx.organization_id,
            user_id=ctx.user_id,
            is_manual=True,
            transaction_date=txn_date,
            tax_year=txn_date.year,
            amount=payload.amount,
            transaction_type="income",
            category="rental_revenue",
            channel=payload.channel,
            description=payload.description,
            payer_name=payload.payer_name,
            status="approved",
        )
        row = await attribution_repo.create(
            db,
            user_id=ctx.user_id,
            organization_id=ctx.organization_id,
            transaction_id=txn.id,
            proposed_applicant_id=None,
            confidence=payload.confidence,
            proposed_property_id=payload.proposed_property_id,
        )
        return _SeedAttributionReviewResponse(id=row.id, transaction_id=txn.id)


@router.delete("/test/attribution-review/{review_id}", status_code=204)
async def hard_delete_attribution_review(
    review_id: uuid.UUID,
    ctx: RequestContext = Depends(current_org_member),
) -> None:
    """Hard-delete an attribution-review row and its seeded transaction.

    Deleting the transaction cascades the review row (FK ON DELETE CASCADE),
    but a confirmed/rejected row may already be resolved — delete both
    explicitly, org-scoped, so no E2E artifact survives per
    ``feedback_clean_test_data``. Test-only.
    """
    _require_test_mode()
    async with unit_of_work() as db:
        transaction_id = await attribution_repo.hard_delete_by_id(
            db, review_id=review_id, organization_id=ctx.organization_id,
        )
        if transaction_id is not None:
            await transaction_repo.hard_delete_by_id(
                db, transaction_id=transaction_id, organization_id=ctx.organization_id,
            )
    if transaction_id is None:
        raise HTTPException(status_code=404, detail="Attribution review not found")
