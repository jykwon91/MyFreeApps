"""Decide which lease a rent receipt belongs to and what period it covers.

Split out of ``receipt_service`` (file-size no-growth policy) so the lease
lookup and the period defaulting live together — they answer one question
and share the same lease row.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leases.signed_lease import SignedLease
from app.repositories.leases import signed_lease_repo
from app.services.leases.receipt_formatting import clamp_period_to_term, default_period


async def _resolve_lease(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    applicant_id: uuid.UUID,
    txn_date: _dt.date,
) -> SignedLease | None:
    """Pick the lease a payment on ``txn_date`` belongs to.

    Prefers the lease whose term actually contains the payment date, so a
    payment made under a parent lease is not attributed to the successor
    that replaced it. Falls back to the tenant's most recent lease when no
    term covers the date — that is the pre-existing behaviour and still the
    best guess for open-ended or off-term payments.
    """
    covering = await signed_lease_repo.get_covering_date(
        db,
        user_id=user_id,
        organization_id=organization_id,
        applicant_id=applicant_id,
        on_date=txn_date,
    )
    if covering is not None:
        return covering

    leases = await signed_lease_repo.list_for_tenant(
        db,
        user_id=user_id,
        organization_id=organization_id,
        applicant_id=applicant_id,
        include_deleted=False,
        limit=1,
    )
    return leases[0] if leases else None


async def resolve_lease_and_period(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    applicant_id: uuid.UUID,
    txn_date: _dt.date,
    period_start_date: _dt.date | None = None,
    period_end_date: _dt.date | None = None,
) -> tuple[uuid.UUID | None, _dt.date, _dt.date]:
    """Return ``(signed_lease_id, period_start, period_end)`` for a receipt.

    An explicit period from the caller always wins — the host may
    deliberately issue a receipt for a range that does not match the lease.
    Otherwise the period defaults to the calendar month of the payment,
    clipped to the lease term so a move-in or move-out month reports the
    days actually under lease rather than the whole month.
    """
    lease = await _resolve_lease(
        db,
        user_id=user_id,
        organization_id=organization_id,
        applicant_id=applicant_id,
        txn_date=txn_date,
    )
    lease_id = lease.id if lease is not None else None

    if period_start_date and period_end_date:
        return lease_id, period_start_date, period_end_date

    start, end = default_period(txn_date)
    if lease is not None:
        start, end = clamp_period_to_term(
            start,
            end,
            term_start=lease.starts_on,
            term_end=lease.ends_on,
        )
    return lease_id, start, end
