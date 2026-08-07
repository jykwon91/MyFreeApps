"""Service layer for utility plans.

Owns three pieces of logic that are deliberately *not* columns:

``renewal_status`` / ``days_until_term_end``
    Derived from ``rate_type`` + ``term_end_date`` + today. Storing a status
    would mean a row silently becoming wrong the morning its term lapsed, with
    nothing to correct it — the exact failure this feature exists to prevent.

``is_current``
    A property accumulates one row per plan it has ever been on. The current
    plan for a (property, service_type) is the one with the latest
    ``service_start_date``, ties broken by ``created_at``. Rows with no start
    date sort last: an undated row is a stub, and a dated row is better
    evidence of what is actually in force.

Renewal alerts fire only on *current* plans whose ``rate_type`` can actually be
renewed. A superseded plan is history, and a ``regulated`` plan (Houston
natural gas, most municipal water) has no competing supplier to switch to —
alerting on either would train the operator to ignore the badge.

All data access is through repositories; this module never imports SQLAlchemy.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from app.core.utility_plan_constants import (
    ACTIONABLE_RENEWAL_STATUSES,
    EXPIRING_SOON_DAYS,
    RATE_TYPE_REGULATED,
    RENEWABLE_RATE_TYPES,
    RENEWAL_STATUS_ACTIVE,
    RENEWAL_STATUS_EXPIRED,
    RENEWAL_STATUS_EXPIRING_SOON,
    RENEWAL_STATUS_NOT_APPLICABLE,
)
from app.db.session import unit_of_work
from app.repositories.properties import property_repo, utility_plan_repo
from app.schemas.properties.utility_plan_list_response import UtilityPlanListResponse
from app.schemas.properties.utility_plan_renewal_alert_response import (
    UtilityPlanRenewalAlertResponse,
)
from app.schemas.properties.utility_plan_response import UtilityPlanResponse
from app.schemas.properties.utility_plan_summary import UtilityPlanSummary
from app.schemas.properties.utility_plan_validation import validate_plan_fields
from app.services.extraction.utility_account_service import normalize_account_number


class UtilityPlanNotFoundError(LookupError):
    pass


class InvalidUtilityPlanError(ValueError):
    """A create/update would leave the row internally inconsistent."""


# ---------------------------------------------------------------------------
# Derived fields — pure functions, no I/O
# ---------------------------------------------------------------------------

def days_until_term_end(
    term_end_date: _dt.date | None,
    *,
    today: _dt.date | None = None,
) -> int | None:
    """Whole days from ``today`` to ``term_end_date``; negative once lapsed."""
    if term_end_date is None:
        return None
    reference = today or _dt.date.today()
    return (term_end_date - reference).days


def renewal_status(
    rate_type: str,
    term_end_date: _dt.date | None,
    *,
    today: _dt.date | None = None,
    window_days: int = EXPIRING_SOON_DAYS,
) -> str:
    """Classify a plan's renewal urgency.

    ``not_applicable`` covers both "no end date recorded" and "regulated
    monopoly" — in neither case is there a deadline the operator can act on.
    A ``variable`` plan with an end date is still classified normally: that is
    what a lapsed fixed plan looks like once it has been recorded honestly, and
    the operator still wants to see it.
    """
    if rate_type == RATE_TYPE_REGULATED or term_end_date is None:
        return RENEWAL_STATUS_NOT_APPLICABLE

    remaining = days_until_term_end(term_end_date, today=today)
    if remaining is None:
        return RENEWAL_STATUS_NOT_APPLICABLE
    if remaining < 0:
        return RENEWAL_STATUS_EXPIRED
    if remaining <= window_days:
        return RENEWAL_STATUS_EXPIRING_SOON
    return RENEWAL_STATUS_ACTIVE


def _currency_sort_key(plan: Any) -> tuple:
    """Sort key selecting the most recently started plan first.

    Undated rows sort last (``date.min``) — a stub with no start date should
    never outrank a row that records when service actually began.
    """
    return (
        plan.service_start_date or _dt.date.min,
        plan.created_at,
    )


def current_plan_ids(plans: list[Any]) -> set[uuid.UUID]:
    """IDs of the current plan for each (property_id, service_type) group."""
    best: dict[tuple[uuid.UUID, str], Any] = {}
    for plan in plans:
        key = (plan.property_id, plan.service_type)
        incumbent = best.get(key)
        if incumbent is None or _currency_sort_key(plan) > _currency_sort_key(incumbent):
            best[key] = plan
    return {plan.id for plan in best.values()}


# ---------------------------------------------------------------------------
# Mapping
# ---------------------------------------------------------------------------

def _to_summary(
    plan: Any,
    *,
    property_names: dict[uuid.UUID, str],
    current_ids: set[uuid.UUID],
    today: _dt.date | None = None,
) -> UtilityPlanSummary:
    return UtilityPlanSummary(
        id=plan.id,
        property_id=plan.property_id,
        property_name=property_names.get(plan.property_id),
        service_type=plan.service_type,
        provider_name=plan.provider_name,
        plan_name=plan.plan_name,
        rate_type=plan.rate_type,
        avg_price_cents_per_kwh_at_1000=plan.avg_price_cents_per_kwh_at_1000,
        term_end_date=plan.term_end_date,
        days_until_term_end=days_until_term_end(plan.term_end_date, today=today),
        renewal_status=renewal_status(plan.rate_type, plan.term_end_date, today=today),
        is_current=plan.id in current_ids,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
    )


def _to_detail(
    plan: Any,
    *,
    property_name: str | None,
    is_current: bool,
    today: _dt.date | None = None,
) -> UtilityPlanResponse:
    return UtilityPlanResponse(
        id=plan.id,
        user_id=plan.user_id,
        organization_id=plan.organization_id,
        property_id=plan.property_id,
        property_name=property_name,
        service_type=plan.service_type,
        provider_name=plan.provider_name,
        account_number=plan.account_number,
        plan_name=plan.plan_name,
        rate_type=plan.rate_type,
        energy_charge_cents_per_kwh=plan.energy_charge_cents_per_kwh,
        tdu_charge_cents_per_kwh=plan.tdu_charge_cents_per_kwh,
        avg_price_cents_per_kwh_at_1000=plan.avg_price_cents_per_kwh_at_1000,
        monthly_base_charge_cents=plan.monthly_base_charge_cents,
        term_months=plan.term_months,
        service_start_date=plan.service_start_date,
        term_end_date=plan.term_end_date,
        early_termination_fee_cents=plan.early_termination_fee_cents,
        has_bill_credit=plan.has_bill_credit,
        bill_credit_amount_cents=plan.bill_credit_amount_cents,
        bill_credit_threshold_kwh=plan.bill_credit_threshold_kwh,
        min_usage_fee_cents=plan.min_usage_fee_cents,
        min_usage_threshold_kwh=plan.min_usage_threshold_kwh,
        notes=plan.notes,
        days_until_term_end=days_until_term_end(plan.term_end_date, today=today),
        renewal_status=renewal_status(plan.rate_type, plan.term_end_date, today=today),
        is_current=is_current,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
    )


class _MergedPlan:
    """Post-update field view, used to re-validate a PATCH before it flushes.

    A partial update can violate a cross-field rule using a value it did not
    send (setting ``term_end_date`` earlier than a stored ``service_start_date``,
    say). Validating the merged result here turns that into a 422 instead of an
    IntegrityError surfacing as a 500.
    """

    def __init__(self, plan: Any, fields: dict[str, Any]) -> None:
        for name in (
            "service_type",
            "rate_type",
            "service_start_date",
            "term_end_date",
            "has_bill_credit",
            "bill_credit_amount_cents",
            "bill_credit_threshold_kwh",
        ):
            setattr(self, name, fields.get(name, getattr(plan, name)))


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

async def create_plan(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    fields: dict[str, Any],
) -> UtilityPlanResponse:
    payload = dict(fields)
    account_number = payload.get("account_number")
    if account_number:
        # Normalized identically to utility_account_link so the plan and the
        # learned bill→property link describe the same account key.
        payload["account_number"] = normalize_account_number(account_number)

    async with unit_of_work() as db:
        plan = await utility_plan_repo.create(
            db,
            user_id=user_id,
            organization_id=organization_id,
            **payload,
        )
        names = await property_repo.get_name_map(db, organization_id)
        siblings = await utility_plan_repo.list_all_active_for_org(
            db, user_id=user_id, organization_id=organization_id,
        )
        current_ids = current_plan_ids(siblings)
        detail = _to_detail(
            plan,
            property_name=names.get(plan.property_id),
            is_current=plan.id in current_ids,
        )
    return detail


# ---------------------------------------------------------------------------
# List + get
# ---------------------------------------------------------------------------

async def list_plans(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    property_id: uuid.UUID | None = None,
    service_type: str | None = None,
    expiring_before: _dt.date | None = None,
    limit: int = 50,
    offset: int = 0,
) -> UtilityPlanListResponse:
    async with unit_of_work() as db:
        rows = await utility_plan_repo.list_for_org(
            db,
            user_id=user_id,
            organization_id=organization_id,
            property_id=property_id,
            service_type=service_type,
            expiring_before=expiring_before,
            limit=limit,
            offset=offset,
        )
        total = await utility_plan_repo.count_for_org(
            db,
            user_id=user_id,
            organization_id=organization_id,
            property_id=property_id,
            service_type=service_type,
            expiring_before=expiring_before,
        )
        names = await property_repo.get_name_map(db, organization_id)
        # Currency is a property of the whole set, so it is resolved against
        # every active plan rather than just this page.
        all_active = await utility_plan_repo.list_all_active_for_org(
            db, user_id=user_id, organization_id=organization_id,
        )
        current_ids = current_plan_ids(all_active)

    items = [
        _to_summary(r, property_names=names, current_ids=current_ids)
        for r in rows
    ]
    return UtilityPlanListResponse(
        items=items, total=total, has_more=(offset + len(items)) < total,
    )


async def get_plan(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    plan_id: uuid.UUID,
) -> UtilityPlanResponse:
    async with unit_of_work() as db:
        plan = await utility_plan_repo.get(
            db,
            plan_id=plan_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if plan is None:
            raise UtilityPlanNotFoundError(str(plan_id))
        names = await property_repo.get_name_map(db, organization_id)
        all_active = await utility_plan_repo.list_all_active_for_org(
            db, user_id=user_id, organization_id=organization_id,
        )
        current_ids = current_plan_ids(all_active)
        return _to_detail(
            plan,
            property_name=names.get(plan.property_id),
            is_current=plan.id in current_ids,
        )


# ---------------------------------------------------------------------------
# Renewal alerts
# ---------------------------------------------------------------------------

async def get_renewal_alerts(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    window_days: int = EXPIRING_SOON_DAYS,
    today: _dt.date | None = None,
) -> UtilityPlanRenewalAlertResponse:
    """Current, renewable plans whose term has lapsed or is about to."""
    async with unit_of_work() as db:
        all_active = await utility_plan_repo.list_all_active_for_org(
            db, user_id=user_id, organization_id=organization_id,
        )
        names = await property_repo.get_name_map(db, organization_id)

    current_ids = current_plan_ids(all_active)

    expired: list[UtilityPlanSummary] = []
    expiring_soon: list[UtilityPlanSummary] = []
    for plan in all_active:
        if plan.id not in current_ids:
            continue
        if plan.rate_type not in RENEWABLE_RATE_TYPES:
            continue
        status = renewal_status(
            plan.rate_type,
            plan.term_end_date,
            today=today,
            window_days=window_days,
        )
        if status not in ACTIONABLE_RENEWAL_STATUSES:
            continue
        summary = _to_summary(
            plan,
            property_names=names,
            current_ids=current_ids,
            today=today,
        )
        if status == RENEWAL_STATUS_EXPIRED:
            expired.append(summary)
        else:
            expiring_soon.append(summary)

    # Longest-lapsed first, then soonest-to-lapse: both orderings put the most
    # urgent row at the top of its group.
    expired.sort(key=lambda s: s.days_until_term_end or 0)
    expiring_soon.sort(key=lambda s: s.days_until_term_end or 0)

    return UtilityPlanRenewalAlertResponse(
        window_days=window_days,
        expired=expired,
        expiring_soon=expiring_soon,
        total_needing_attention=len(expired) + len(expiring_soon),
    )


async def sweep_plans_needing_renewal(
    *,
    today: _dt.date | None = None,
    window_days: int = EXPIRING_SOON_DAYS,
) -> list[UtilityPlanSummary]:
    """Cross-tenant version of :func:`get_renewal_alerts`, for the scheduler.

    Every other function here is tenant-scoped; this one is not, because the
    scheduler runs on behalf of no one. It is not reachable from any route —
    only ``workers.scheduler_worker`` calls it.

    Ordered most urgent (longest lapsed) first.
    """
    reference = today or _dt.date.today()
    cutoff = reference + _dt.timedelta(days=window_days)

    async with unit_of_work() as db:
        candidates = await utility_plan_repo.list_active_for_expiring_properties(
            db, cutoff=cutoff,
        )
        names = await property_repo.get_labels_by_ids(
            db, [p.property_id for p in candidates],
        )

    current_ids = current_plan_ids(candidates)

    flagged = [
        _to_summary(
            plan, property_names=names, current_ids=current_ids, today=reference,
        )
        for plan in candidates
        if plan.id in current_ids
        and plan.rate_type in RENEWABLE_RATE_TYPES
        and renewal_status(
            plan.rate_type,
            plan.term_end_date,
            today=reference,
            window_days=window_days,
        )
        in ACTIONABLE_RENEWAL_STATUSES
    ]
    flagged.sort(key=lambda s: s.days_until_term_end or 0)
    return flagged


# ---------------------------------------------------------------------------
# Update + delete
# ---------------------------------------------------------------------------

async def update_plan(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    plan_id: uuid.UUID,
    fields: dict[str, Any],
) -> UtilityPlanResponse:
    payload = dict(fields)
    account_number = payload.get("account_number")
    if account_number:
        payload["account_number"] = normalize_account_number(account_number)

    async with unit_of_work() as db:
        existing = await utility_plan_repo.get(
            db,
            plan_id=plan_id,
            user_id=user_id,
            organization_id=organization_id,
        )
        if existing is None:
            raise UtilityPlanNotFoundError(str(plan_id))

        try:
            validate_plan_fields(_MergedPlan(existing, payload))
        except ValueError as exc:
            raise InvalidUtilityPlanError(str(exc)) from exc

        plan = await utility_plan_repo.update_plan(
            db,
            plan_id=plan_id,
            user_id=user_id,
            organization_id=organization_id,
            fields=payload,
        )
        if plan is None:
            raise UtilityPlanNotFoundError(str(plan_id))

        names = await property_repo.get_name_map(db, organization_id)
        all_active = await utility_plan_repo.list_all_active_for_org(
            db, user_id=user_id, organization_id=organization_id,
        )
        current_ids = current_plan_ids(all_active)
        return _to_detail(
            plan,
            property_name=names.get(plan.property_id),
            is_current=plan.id in current_ids,
        )


async def soft_delete_plan(
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    plan_id: uuid.UUID,
) -> None:
    async with unit_of_work() as db:
        deleted = await utility_plan_repo.soft_delete(
            db,
            plan_id=plan_id,
            user_id=user_id,
            organization_id=organization_id,
        )
    if not deleted:
        raise UtilityPlanNotFoundError(str(plan_id))
