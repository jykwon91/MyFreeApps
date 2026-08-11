"""Repository for ``utility_plans``.

Queries stay portable across PostgreSQL (production) and SQLite (tests), so
``DISTINCT ON`` and window functions are avoided. Selecting the *current* plan
per (property, service_type) is ordering + a small in-memory reduction in the
service layer rather than SQL — at the scale of one row per utility per
property, the clarity is worth more than the round trip saved.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from sqlalchemy import Select, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.properties.utility_plan import UtilityPlan


def _scope(
    stmt: Select,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    include_deleted: bool,
) -> Select:
    """Apply tenant isolation (and the soft-delete filter) to ``stmt``."""
    stmt = stmt.where(
        UtilityPlan.user_id == user_id,
        UtilityPlan.organization_id == organization_id,
    )
    if not include_deleted:
        stmt = stmt.where(UtilityPlan.deleted_at.is_(None))
    return stmt


def _apply_filters(
    stmt: Select,
    *,
    property_id: uuid.UUID | None,
    service_type: str | None,
    expiring_before: _dt.date | None,
) -> Select:
    if property_id is not None:
        stmt = stmt.where(UtilityPlan.property_id == property_id)
    if service_type is not None:
        stmt = stmt.where(UtilityPlan.service_type == service_type)
    if expiring_before is not None:
        stmt = stmt.where(
            UtilityPlan.term_end_date.isnot(None),
            UtilityPlan.term_end_date <= expiring_before,
        )
    return stmt


async def create(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    property_id: uuid.UUID,
    service_type: str,
    provider_name: str,
    rate_type: str,
    account_number: str | None = None,
    plan_name: str | None = None,
    energy_charge_cents_per_kwh: Any | None = None,
    tdu_charge_cents_per_kwh: Any | None = None,
    avg_price_cents_per_kwh_at_1000: Any | None = None,
    monthly_base_charge_cents: int | None = None,
    term_months: int | None = None,
    service_start_date: _dt.date | None = None,
    term_end_date: _dt.date | None = None,
    early_termination_fee_cents: int | None = None,
    has_bill_credit: bool = False,
    bill_credit_amount_cents: int | None = None,
    bill_credit_threshold_kwh: int | None = None,
    min_usage_fee_cents: int | None = None,
    min_usage_threshold_kwh: int | None = None,
    post_promo_monthly_cents: int | None = None,
    equipment_fee_monthly_cents: int | None = None,
    download_mbps: int | None = None,
    upload_mbps: int | None = None,
    data_cap_gb: int | None = None,
    source_document_id: uuid.UUID | None = None,
    notes: str | None = None,
) -> UtilityPlan:
    plan = UtilityPlan(
        user_id=user_id,
        organization_id=organization_id,
        property_id=property_id,
        service_type=service_type,
        provider_name=provider_name,
        rate_type=rate_type,
        account_number=account_number,
        plan_name=plan_name,
        energy_charge_cents_per_kwh=energy_charge_cents_per_kwh,
        tdu_charge_cents_per_kwh=tdu_charge_cents_per_kwh,
        avg_price_cents_per_kwh_at_1000=avg_price_cents_per_kwh_at_1000,
        monthly_base_charge_cents=monthly_base_charge_cents,
        term_months=term_months,
        service_start_date=service_start_date,
        term_end_date=term_end_date,
        early_termination_fee_cents=early_termination_fee_cents,
        has_bill_credit=has_bill_credit,
        bill_credit_amount_cents=bill_credit_amount_cents,
        bill_credit_threshold_kwh=bill_credit_threshold_kwh,
        min_usage_fee_cents=min_usage_fee_cents,
        min_usage_threshold_kwh=min_usage_threshold_kwh,
        post_promo_monthly_cents=post_promo_monthly_cents,
        equipment_fee_monthly_cents=equipment_fee_monthly_cents,
        download_mbps=download_mbps,
        upload_mbps=upload_mbps,
        data_cap_gb=data_cap_gb,
        source_document_id=source_document_id,
        notes=notes,
    )
    db.add(plan)
    await db.flush()
    return plan


async def get(
    db: AsyncSession,
    *,
    plan_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    include_deleted: bool = False,
) -> UtilityPlan | None:
    stmt = _scope(
        select(UtilityPlan).where(UtilityPlan.id == plan_id),
        user_id=user_id,
        organization_id=organization_id,
        include_deleted=include_deleted,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_for_org(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    property_id: uuid.UUID | None = None,
    service_type: str | None = None,
    expiring_before: _dt.date | None = None,
    include_deleted: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[UtilityPlan]:
    stmt = _apply_filters(
        _scope(
            select(UtilityPlan),
            user_id=user_id,
            organization_id=organization_id,
            include_deleted=include_deleted,
        ),
        property_id=property_id,
        service_type=service_type,
        expiring_before=expiring_before,
    )
    # Newest term first so the current plan for each property leads its group;
    # created_at breaks ties for rows entered without a start date.
    stmt = (
        stmt.order_by(
            desc(UtilityPlan.service_start_date),
            desc(UtilityPlan.created_at),
        )
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_for_org(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    property_id: uuid.UUID | None = None,
    service_type: str | None = None,
    expiring_before: _dt.date | None = None,
    include_deleted: bool = False,
) -> int:
    stmt = _apply_filters(
        _scope(
            select(func.count()).select_from(UtilityPlan),
            user_id=user_id,
            organization_id=organization_id,
            include_deleted=include_deleted,
        ),
        property_id=property_id,
        service_type=service_type,
        expiring_before=expiring_before,
    )
    result = await db.execute(stmt)
    return int(result.scalar_one())


async def list_all_active_for_org(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> list[UtilityPlan]:
    """Every non-deleted plan for the org, newest term first.

    Unpaginated on purpose: the caller reduces this to one current plan per
    (property, service_type), which is only correct over the complete set. An
    org tracks a handful of utilities per property, so the result stays small.
    """
    stmt = _scope(
        select(UtilityPlan),
        user_id=user_id,
        organization_id=organization_id,
        include_deleted=False,
    ).order_by(
        UtilityPlan.property_id,
        UtilityPlan.service_type,
        desc(UtilityPlan.service_start_date),
        desc(UtilityPlan.created_at),
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def list_active_for_expiring_properties(
    db: AsyncSession,
    *,
    cutoff: _dt.date,
) -> list[UtilityPlan]:
    """Every active plan belonging to a property with a term ending by ``cutoff``.

    Deliberately NOT tenant-scoped — the scheduler sweeps across every user,
    the same way ``signed_lease_repo`` does for lease auto-end.

    The result is widened from "rows that expire" to "all rows of the affected
    properties" because a plan only warrants an alert if it is the *current*
    one, and currency can only be decided against a property's full set. The
    subquery keeps that widening bounded to properties that have something
    lapsing rather than scanning the whole table.
    """
    affected = (
        select(UtilityPlan.property_id)
        .where(
            UtilityPlan.deleted_at.is_(None),
            UtilityPlan.term_end_date.isnot(None),
            UtilityPlan.term_end_date <= cutoff,
        )
        .scalar_subquery()
    )
    stmt = (
        select(UtilityPlan)
        .where(
            UtilityPlan.deleted_at.is_(None),
            UtilityPlan.property_id.in_(affected),
        )
        .order_by(
            UtilityPlan.property_id,
            UtilityPlan.service_type,
            desc(UtilityPlan.service_start_date),
            desc(UtilityPlan.created_at),
        )
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_plan(
    db: AsyncSession,
    *,
    plan_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    fields: dict[str, Any],
) -> UtilityPlan | None:
    plan = await get(
        db,
        plan_id=plan_id,
        user_id=user_id,
        organization_id=organization_id,
    )
    if plan is None:
        return None
    for key, value in fields.items():
        setattr(plan, key, value)
    await db.flush()
    return plan


async def soft_delete(
    db: AsyncSession,
    *,
    plan_id: uuid.UUID,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> bool:
    result = await db.execute(
        update(UtilityPlan)
        .where(
            UtilityPlan.id == plan_id,
            UtilityPlan.user_id == user_id,
            UtilityPlan.organization_id == organization_id,
            UtilityPlan.deleted_at.is_(None),
        )
        .values(deleted_at=_dt.datetime.now(_dt.timezone.utc))
    )
    return (result.rowcount or 0) > 0
