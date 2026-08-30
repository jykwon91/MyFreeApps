"""Repository for ``rent_charges``, plus the payment query the ledger reads.

The payment side deliberately lives here rather than in ``transaction_repo``:
"which transactions count as rent paid by this tenant" is a rent-ledger rule,
not a general transaction query, and keeping it beside the charges makes the
two halves of the ledger reviewable together.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rent.rent_charge import RentCharge
from app.models.transactions.transaction import Transaction

# Income categories that settle a rent charge. ``security_deposit`` is
# pointedly absent: a deposit is held on the tenant's behalf, not earned, so
# letting it settle rent would show a tenant as paid-up on money the host still
# owes back. ``cleaning_fee_revenue`` is likewise not rent.
RENT_PAYMENT_CATEGORIES: tuple[str, ...] = ("rental_revenue",)

# Statuses whose rows must not settle anything. ``duplicate`` rows are the
# same money counted twice.
_EXCLUDED_TXN_STATUSES: tuple[str, ...] = ("duplicate",)


async def create(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    applicant_id: uuid.UUID,
    period_start: _dt.date,
    period_end: _dt.date,
    due_date: _dt.date,
    amount: Decimal,
    charge_type: str = "rent",
    schedule_id: uuid.UUID | None = None,
    description: str | None = None,
) -> RentCharge:
    charge = RentCharge(
        user_id=user_id,
        organization_id=organization_id,
        applicant_id=applicant_id,
        schedule_id=schedule_id,
        charge_type=charge_type,
        period_start=period_start,
        period_end=period_end,
        due_date=due_date,
        amount=amount,
        description=description,
    )
    db.add(charge)
    await db.flush()
    await db.refresh(charge)
    return charge


async def get(
    db: AsyncSession, *, organization_id: uuid.UUID, charge_id: uuid.UUID,
) -> RentCharge | None:
    result = await db.execute(
        select(RentCharge).where(
            RentCharge.id == charge_id,
            RentCharge.organization_id == organization_id,
            RentCharge.deleted_at.is_(None),
        ),
    )
    return result.scalar_one_or_none()


async def list_for_applicant(
    db: AsyncSession, *, organization_id: uuid.UUID, applicant_id: uuid.UUID,
) -> Sequence[RentCharge]:
    """Every live charge for one tenant in settlement order."""
    result = await db.execute(
        select(RentCharge)
        .where(
            RentCharge.organization_id == organization_id,
            RentCharge.applicant_id == applicant_id,
            RentCharge.deleted_at.is_(None),
        )
        .order_by(RentCharge.due_date, RentCharge.created_at, RentCharge.id),
    )
    return result.scalars().all()


async def list_for_schedule(
    db: AsyncSession, *, schedule_id: uuid.UUID,
) -> Sequence[RentCharge]:
    """Live charges already materialized for a schedule.

    Read by the generator so it can reconcile existing periods rather than
    relying on the unique index to raise — an IntegrityError would abort the
    whole surrounding transaction, taking unrelated work down with it.
    """
    result = await db.execute(
        select(RentCharge)
        .where(
            RentCharge.schedule_id == schedule_id,
            RentCharge.deleted_at.is_(None),
        )
        .order_by(RentCharge.period_start),
    )
    return result.scalars().all()


async def list_payments_for_applicant(
    db: AsyncSession, *, organization_id: uuid.UUID, applicant_id: uuid.UUID,
) -> Sequence[Transaction]:
    """Rent payments attributed to one tenant, oldest first.

    Scoped to income rows in ``RENT_PAYMENT_CATEGORIES`` so deposits and
    cleaning fees never settle a rent charge.
    """
    result = await db.execute(
        select(Transaction)
        .where(
            Transaction.organization_id == organization_id,
            Transaction.applicant_id == applicant_id,
            Transaction.transaction_type == "income",
            Transaction.category.in_(RENT_PAYMENT_CATEGORIES),
            Transaction.status.not_in(_EXCLUDED_TXN_STATUSES),
            Transaction.deleted_at.is_(None),
        )
        .order_by(
            Transaction.transaction_date, Transaction.created_at, Transaction.id,
        ),
    )
    return result.scalars().all()


async def set_waiver(
    db: AsyncSession, *, charge: RentCharge, reason: str | None,
) -> RentCharge:
    """Waive a charge, or restore it.

    A reason waives; ``None`` restores. Waiving is preferred over deleting for
    a generated charge — the period genuinely existed, and the reason is the
    record of why it stopped being owed.
    """
    if reason is None:
        charge.waived_at = None
        charge.waived_reason = None
    else:
        charge.waived_at = _dt.datetime.now(_dt.timezone.utc)
        charge.waived_reason = reason
    await db.flush()
    return charge


async def retime(
    db: AsyncSession, *, charge: RentCharge, period_end: _dt.date, amount: Decimal,
) -> RentCharge:
    """Re-fit an existing charge to its schedule's current terms.

    Called when a schedule's end date moves and the final period has to shrink
    or grow. Only the period's tail and its prorated amount change — the row's
    identity, its start date and anything already allocated to it survive, so
    the tenant's history is not rewritten underneath them.
    """
    charge.period_end = period_end
    charge.amount = amount
    await db.flush()
    return charge


async def soft_delete(db: AsyncSession, *, charge: RentCharge) -> None:
    charge.deleted_at = _dt.datetime.now(_dt.timezone.utc)
    await db.flush()
