"""One row of utility-plan seed data, keyed to a property by address fragment.

Separate from the seed data itself so the shape can be reused if another set of
plans is ever seeded (a second portfolio, a restore onto a fresh database).
"""
from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class UtilityPlanSeedRow:
    """A plan to insert, plus the fragment used to find its property.

    ``property_match`` is matched case-insensitively against both ``name`` and
    ``address``. It must resolve to exactly one property — the seeder refuses
    to guess, because attaching a rate plan to the wrong property produces a
    renewal alert for a contract that does not exist there.
    """

    property_match: str
    service_type: str
    provider_name: str
    rate_type: str
    account_number: str | None = None
    plan_name: str | None = None
    energy_charge_cents_per_kwh: Decimal | None = None
    tdu_charge_cents_per_kwh: Decimal | None = None
    avg_price_cents_per_kwh_at_1000: Decimal | None = None
    monthly_base_charge_cents: int | None = None
    term_months: int | None = None
    service_start_date: _dt.date | None = None
    term_end_date: _dt.date | None = None
    early_termination_fee_cents: int | None = None
    min_usage_fee_cents: int | None = None
    min_usage_threshold_kwh: int | None = None
    notes: str | None = None
