"""Pure helpers behind ``utility_plan_service`` — derivation and mapping.

Split out so the service module holds only orchestration (load, decide,
persist). Nothing here touches the database or the session, so every function
is directly testable with a plain object.

The service re-exports the public names, so ``utility_plan_service.renewal_status``
and friends remain the import path callers already use.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any

from app.core.utility_plan_constants import (
    EXPIRING_SOON_DAYS,
    RATE_TYPE_REGULATED,
    RENEWAL_STATUS_ACTIVE,
    RENEWAL_STATUS_EXPIRED,
    RENEWAL_STATUS_EXPIRING_SOON,
    RENEWAL_STATUS_NOT_APPLICABLE,
)
from app.schemas.properties.utility_plan_response import UtilityPlanResponse
from app.schemas.properties.utility_plan_summary import UtilityPlanSummary


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

def to_summary(
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


def to_detail(
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
        post_promo_monthly_cents=plan.post_promo_monthly_cents,
        equipment_fee_monthly_cents=plan.equipment_fee_monthly_cents,
        download_mbps=plan.download_mbps,
        upload_mbps=plan.upload_mbps,
        data_cap_gb=plan.data_cap_gb,
        source_document_id=plan.source_document_id,
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
            "post_promo_monthly_cents",
        ):
            setattr(self, name, fields.get(name, getattr(plan, name)))
