"""Seed rows for the Peerless St portfolio's utility plans.

Every figure here was transcribed from the provider's own email, not inferred:

* Constellation enrollment confirmations, 2025-01-23 — 6732 PEERLESS ST and
  6734 PEERLESS ST (two separate messages, same plan and same rates).
* Constellation "Residential Plan Change Notice", 2025-01-27 — 6738 PEERLESS
  ST, account 204430810.
* CenterPoint payment alerts — the only messages that print an account number
  and its service address together: 6403771807-5 is 6734, 6403771834-9 is 6732.

Two things are deliberately left NULL rather than guessed:

1. **The electric account numbers for 6732 and 6734.** Two Constellation
   accounts (204865879, 204865622) appear on invoices, but no message binds
   either to a street address, and the enrollment confirmations pre-date
   account creation. Which is which is recorded in ``notes`` for the operator
   to resolve from a bill; inventing the mapping would silently attach the
   wrong account to a property.
2. **6738's average price and early-termination fee.** The plan-change notice
   states the term, the component rates, and the start date, but not those two
   figures. They are almost certainly identical to the other two properties —
   "almost certainly" is not a source.

``term_end_date`` is start + ``term_months`` in every case. The enrollment
emails say the exact contract end date arrives in the welcome package, which is
not in the mailbox; the derived date is accurate to the day the term was sold
and is what the renewal alert needs. All three electric terms have already
lapsed, which is the point of seeding them.
"""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

from app.cli.utility_plan_seed_row import UtilityPlanSeedRow
from app.core.utility_plan_constants import (
    RATE_TYPE_FIXED,
    RATE_TYPE_REGULATED,
    SERVICE_TYPE_ELECTRICITY,
    SERVICE_TYPE_NATURAL_GAS,
)

_CONSTELLATION = "Constellation"
_CONSTELLATION_PLAN = "FIXED Electricity Plan + Air Conditioner Protection Plan"
_CENTERPOINT = "CenterPoint Energy"

_ENERGY_CHARGE = Decimal("11.6000")
_TDU_CHARGE = Decimal("5.3509")
_AVG_PRICE_AT_1000 = Decimal("13.9000")
_MONTHLY_BASE_CENTS = 439
_ETF_CENTS = 15_000

# The EFL states a minimum-usage fee of 0.00000 below 999 kWh — i.e. the plan
# has the trap's shape but the fee is zero. Recorded as stated so a later
# comparison against a plan that *does* charge one is like-for-like.
_MIN_USAGE_FEE_CENTS = 0
_MIN_USAGE_THRESHOLD_KWH = 999

_UNKNOWN_ELECTRIC_ACCOUNT_NOTE = (
    "Electric account number unresolved: Constellation accounts 204865879 and "
    "204865622 both bill to this portfolio, but no email binds either to a "
    "street address. Set it from a bill. Term end derived as start + 12 months "
    "(the welcome package holds the exact contract end date)."
)

PEERLESS_UTILITY_PLANS: tuple[UtilityPlanSeedRow, ...] = (
    UtilityPlanSeedRow(
        property_match="6732 Peerless",
        service_type=SERVICE_TYPE_ELECTRICITY,
        provider_name=_CONSTELLATION,
        rate_type=RATE_TYPE_FIXED,
        plan_name=_CONSTELLATION_PLAN,
        energy_charge_cents_per_kwh=_ENERGY_CHARGE,
        tdu_charge_cents_per_kwh=_TDU_CHARGE,
        avg_price_cents_per_kwh_at_1000=_AVG_PRICE_AT_1000,
        monthly_base_charge_cents=_MONTHLY_BASE_CENTS,
        term_months=12,
        service_start_date=_dt.date(2025, 1, 23),
        term_end_date=_dt.date(2026, 1, 23),
        early_termination_fee_cents=_ETF_CENTS,
        min_usage_fee_cents=_MIN_USAGE_FEE_CENTS,
        min_usage_threshold_kwh=_MIN_USAGE_THRESHOLD_KWH,
        notes=_UNKNOWN_ELECTRIC_ACCOUNT_NOTE,
    ),
    UtilityPlanSeedRow(
        property_match="6734 Peerless",
        service_type=SERVICE_TYPE_ELECTRICITY,
        provider_name=_CONSTELLATION,
        rate_type=RATE_TYPE_FIXED,
        plan_name=_CONSTELLATION_PLAN,
        energy_charge_cents_per_kwh=_ENERGY_CHARGE,
        tdu_charge_cents_per_kwh=_TDU_CHARGE,
        avg_price_cents_per_kwh_at_1000=_AVG_PRICE_AT_1000,
        monthly_base_charge_cents=_MONTHLY_BASE_CENTS,
        term_months=12,
        service_start_date=_dt.date(2025, 1, 23),
        term_end_date=_dt.date(2026, 1, 23),
        early_termination_fee_cents=_ETF_CENTS,
        min_usage_fee_cents=_MIN_USAGE_FEE_CENTS,
        min_usage_threshold_kwh=_MIN_USAGE_THRESHOLD_KWH,
        notes=_UNKNOWN_ELECTRIC_ACCOUNT_NOTE,
    ),
    UtilityPlanSeedRow(
        property_match="6738 Peerless",
        service_type=SERVICE_TYPE_ELECTRICITY,
        provider_name=_CONSTELLATION,
        rate_type=RATE_TYPE_FIXED,
        account_number="204430810",
        plan_name=_CONSTELLATION_PLAN,
        energy_charge_cents_per_kwh=_ENERGY_CHARGE,
        tdu_charge_cents_per_kwh=_TDU_CHARGE,
        monthly_base_charge_cents=_MONTHLY_BASE_CENTS,
        term_months=12,
        service_start_date=_dt.date(2025, 1, 27),
        term_end_date=_dt.date(2026, 1, 27),
        notes=(
            "From the 2025-01-27 plan-change notice, which does not state the "
            "average price at 1,000 kWh or the early-termination fee — both "
            "left blank rather than copied from the sibling properties. Term "
            "end derived as start + 12 months."
        ),
    ),
    # Houston natural gas is a regulated monopoly: there is no competing
    # supplier and no term to renew, so these carry no dates. They are recorded
    # for the account number and provider, and RATE_TYPE_REGULATED is what
    # keeps them out of the renewal alert.
    UtilityPlanSeedRow(
        property_match="6732 Peerless",
        service_type=SERVICE_TYPE_NATURAL_GAS,
        provider_name=_CENTERPOINT,
        rate_type=RATE_TYPE_REGULATED,
        account_number="6403771834-9",
        notes="Account/address pairing confirmed from CenterPoint payment alerts.",
    ),
    UtilityPlanSeedRow(
        property_match="6734 Peerless",
        service_type=SERVICE_TYPE_NATURAL_GAS,
        provider_name=_CENTERPOINT,
        rate_type=RATE_TYPE_REGULATED,
        account_number="6403771807-5",
        notes="Account/address pairing confirmed from CenterPoint payment alerts.",
    ),
    # No CenterPoint gas account for 6738 appears anywhere in the mailbox.
    # Absence of a bill is not evidence of absence of service, so nothing is
    # seeded for it — the operator adds it through the UI if it exists.
)
