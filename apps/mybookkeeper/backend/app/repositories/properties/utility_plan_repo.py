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

from platform_shared.repositories.audited_writes import update_rows
from sqlalchemy import ColumnElement, Select, case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utility_plan_constants import (
    EXPIRING_SOON_DAYS,
    RATE_TYPE_REGULATED,
    RENEWAL_SORT_RANK_ACTIVE,
    RENEWAL_SORT_RANK_EXPIRED,
    RENEWAL_SORT_RANK_EXPIRING_SOON,
    RENEWAL_SORT_RANK_NOT_APPLICABLE,
    RENEWAL_SORT_RANK_PAST_PLAN,
)
from app.models.properties.property import Property
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
    plan_ids: set[uuid.UUID] | None,
) -> Select:
    if plan_ids is not None:
        stmt = stmt.where(UtilityPlan.id.in_(plan_ids))
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


def _renewal_rank(
    *, today: _dt.date, current_ids: set[uuid.UUID],
) -> ColumnElement[int]:
    """The band ``renewal_status`` puts a plan in on ``today``, as a sortable rank.

    Mirrors ``_utility_plan_helpers.renewal_status`` (lapsed before ``today``,
    expiring within ``EXPIRING_SOON_DAYS`` of it inclusive) so the order always
    agrees with the status shown on each row. Superseded plans rank last
    whatever their dates say: currency is decided over the whole set by the
    service, so it arrives here as ``current_ids``.
    """
    soon_cutoff = today + _dt.timedelta(days=EXPIRING_SOON_DAYS)
    return case(
        (UtilityPlan.id.not_in(current_ids), RENEWAL_SORT_RANK_PAST_PLAN),
        (
            or_(
                UtilityPlan.rate_type == RATE_TYPE_REGULATED,
                UtilityPlan.term_end_date.is_(None),
            ),
            RENEWAL_SORT_RANK_NOT_APPLICABLE,
        ),
        (UtilityPlan.term_end_date < today, RENEWAL_SORT_RANK_EXPIRED),
        (UtilityPlan.term_end_date <= soon_cutoff, RENEWAL_SORT_RANK_EXPIRING_SOON),
        else_=RENEWAL_SORT_RANK_ACTIVE,
    )


def _order_by_renewal(
    stmt: Select, *, today: _dt.date, current_ids: set[uuid.UUID],
) -> Select:
    """Most urgent first, soonest term end first within a band, then by property and service.

    An undated plan leads its band (``NULLS FIRST`` is spelled out because
    PostgreSQL and SQLite disagree on the default). ``id`` makes the order total,
    so a row never shifts between pages. The rank depends on ``today``, so it
    can't be indexed; the tenant filter bounds the sort to one org's plans.
    """
    return stmt.outerjoin(Property, Property.id == UtilityPlan.property_id).order_by(
        _renewal_rank(today=today, current_ids=current_ids),
        UtilityPlan.term_end_date.asc().nulls_first(),
        func.lower(Property.name),
        UtilityPlan.service_type,
        UtilityPlan.id,
    )


async def list_for_org(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    property_id: uuid.UUID | None = None,
    service_type: str | None = None,
    expiring_before: _dt.date | None = None,
    plan_ids: set[uuid.UUID] | None = None,
    include_deleted: bool = False,
    renewal_order_on: _dt.date | None = None,
    current_ids: set[uuid.UUID] | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[UtilityPlan]:
    """One page of the org's plans.

    Newest term first by default. With ``renewal_order_on`` (the caller's local
    date) the page is cut from the renewal-urgency order instead, which needs
    ``current_ids`` to send superseded plans to the end.
    """
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
        plan_ids=plan_ids,
    )
    if renewal_order_on is not None:
        if current_ids is None:
            raise ValueError("renewal order needs the current plan ids")
        stmt = _order_by_renewal(stmt, today=renewal_order_on, current_ids=current_ids)
    else:
        # Newest term first so the current plan for each property leads its group;
        # created_at breaks ties for rows entered without a start date.
        stmt = stmt.order_by(
            desc(UtilityPlan.service_start_date),
            desc(UtilityPlan.created_at),
        )
    stmt = stmt.limit(limit).offset(offset)
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
    plan_ids: set[uuid.UUID] | None = None,
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
        plan_ids=plan_ids,
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
    return bool(await update_rows(
        db,
        UtilityPlan,
        UtilityPlan.id == plan_id,
        UtilityPlan.user_id == user_id,
        UtilityPlan.organization_id == organization_id,
        UtilityPlan.deleted_at.is_(None),
        values={"deleted_at": _dt.datetime.now(_dt.timezone.utc)},
    ))
