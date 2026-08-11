"""Schema for the body of ``POST /utility-plans/extract``.

Deliberately NOT a ``UtilityPlanCreateRequest``. A draft is what a document
appeared to say; a create request is what the operator asserts is true. Three
differences follow from that:

- Every field is optional, including the ones a real plan requires. A document
  that never names its provider produces a draft with no provider, and the form
  asks for it — better than a 422 that discards everything else it did read.
- No cross-field validation. ``validate_plan_fields`` rejects a bill credit
  with no threshold; a document that states one and omits the other is exactly
  the case the operator needs to see and fix, not have thrown away.
- It carries ``warnings`` and ``unrepresented``, which describe the reading
  rather than the plan, and have nowhere to live on a stored row.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, Field


class UtilityPlanDraft(BaseModel):
    """A plan as read from a document — not yet saved, not yet validated."""

    source_document_id: uuid.UUID

    service_type: str | None = None
    provider_name: str | None = None
    plan_name: str | None = None
    account_number: str | None = None
    rate_type: str | None = None

    energy_charge_cents_per_kwh: Decimal | None = None
    tdu_charge_cents_per_kwh: Decimal | None = None
    avg_price_cents_per_kwh_at_1000: Decimal | None = None
    monthly_base_charge_cents: int | None = None

    term_months: int | None = None
    service_start_date: _dt.date | None = None
    term_end_date: _dt.date | None = None
    early_termination_fee_cents: int | None = None

    has_bill_credit: bool = False
    bill_credit_amount_cents: int | None = None
    bill_credit_threshold_kwh: int | None = None
    min_usage_fee_cents: int | None = None
    min_usage_threshold_kwh: int | None = None

    post_promo_monthly_cents: int | None = None
    equipment_fee_monthly_cents: int | None = None
    download_mbps: int | None = None
    upload_mbps: int | None = None
    data_cap_gb: int | None = None

    notes: str | None = None

    confidence: str = "low"
    """How much of this came off the page rather than out of interpretation."""

    warnings: list[str] = Field(default_factory=list)
    """Reasons to distrust a specific field, e.g. a TDU rate from a stale EFL."""

    unrepresented: list[str] = Field(default_factory=list)
    """Real terms the schema has no column for. Dropping these silently would
    make the plan look simpler than it is — the operator can paste them into
    ``notes`` before saving."""
