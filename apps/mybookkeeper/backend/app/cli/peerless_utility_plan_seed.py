"""Seed rows for the Peerless St portfolio's utility plans.

Two generations of electricity contract are seeded per property: the 2025 terms
that have since lapsed, and the 2026 terms currently in force. The lapsed rows
are kept deliberately — a superseded plan is the baseline a new offer gets
measured against, and deleting it destroys the comparison the feature exists to
make. The seeder's idempotency key includes ``service_start_date``, so the two
generations coexist rather than one overwriting the other.

Sources, in order of authority:

* **The Constellation account portal, read 2026-08-10** — plan detail and billed
  usage for all three accounts. This is the only source for the 2026 plans and
  it supersedes the email-derived guesses below wherever they disagree.
* Constellation enrollment confirmations, 2025-01-23 — 6732 and 6734.
* Constellation "Residential Plan Change Notice", 2025-01-27 — 6738.
* CenterPoint payment alerts — the only messages printing an account number and
  its service address together: 6403771807-5 is 6734, 6403771834-9 is 6732.

**The portal resolved the account mapping that email could not.** 204865879 is
6732 and 204865622 is 6734, read off the Accounts page where each customer
number sits beside its service address. Both 2025 rows previously carried NULL
account numbers with the ambiguity recorded in ``notes``; they now carry the
confirmed values.

Still deliberately NULL rather than guessed:

1. **Every 2026 component rate** (energy charge, TDU, monthly base). The portal
   states a single blended "Average Rate" per plan and does not break it out.
   The per-plan EFL does, and is linked from each plan-detail page.
2. **Every early-termination fee.** Not shown in the portal's plan detail. The
   2025 rows' $150 came from the enrollment emails; carrying that figure
   forward onto a differently-named 2026 plan would be invention.
3. **6738's 2025 average price.** Its plan-change notice never stated one, and
   copying a sibling property's is not a source.

``term_end_date`` on the 2025 rows is start + ``term_months``; the exact end
date lived in a welcome package that is not in the mailbox. The 2026 rows use
the portal's stated renewal date, which is authoritative.
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

_SUPERSEDED_2025_NOTE = (
    "Superseded by the 2026-02-17 term; kept as the rate baseline a new offer "
    "is measured against. Account number confirmed from the Constellation "
    "portal 2026-08-10 (it was unresolved while only email was available). "
    "Term end derived as start + 12 months."
)

# The 2026 terms, read from the Constellation account portal on 2026-08-10.
# Every account renewed on the same day and every term ends on the same day.
_TERM_2026_START = _dt.date(2026, 2, 17)
_TERM_2026_END = _dt.date(2027, 2, 17)

# The portal labels this "Average Rate ... per kWh" without stating the usage
# tier it is averaged at. Texas EFLs quote average price at 500 / 1,000 / 2,000
# kWh, so this is recorded in the at-1000 column as the closest true field.
#
# RESOLVED 2026-08-11 against the EFLs, which quote 16.5 (6734) and 17.1 (6738)
# at 1,000 kWh — about 0.85 c/kWh above the portal. That gap is not a conflict:
# the EFLs were issued 12/5/2025 pricing TDU delivery at 6.0009 c/kWh, and
# CenterPoint's current TDU rate is 5.1461 c/kWh. The portal recomputes the
# average against today's TDU, so the portal figures below are the current ones
# and are what a live comparison should use. Do NOT "correct" them to the EFL.
_AVG_RATE_2026_6732 = Decimal("15.0600")
_AVG_RATE_2026_6734 = Decimal("15.6600")
_AVG_RATE_2026_6738 = Decimal("16.2700")

# Read from the per-plan EFLs on 2026-08-11 (portal → plan detail → the
# "Electricity Facts Label" link), both issued 12/5/2025. Unlike the average
# price these are contract terms the supplier fixes for the term, so they do
# not drift with the TDU tariff.
_ETF_2026_CENTS = 15_000
_ENERGY_CHARGE_2026_6734 = Decimal("10.0000")
# Higher than its sibling because the bundled A/C, heating and water-heater
# coverage is priced into the energy charge rather than billed separately.
_ENERGY_CHARGE_2026_6738 = Decimal("14.1100")
_BILL_CREDIT_6738_CENTS = 3_500
_BILL_CREDIT_6738_THRESHOLD_KWH = 1_000

_PLAN_2026_NO_MIN_FEE = "12 Month (No Min Usage Fee)"
_PLAN_2026_AC_PROTECT = "12 Month A/C Protect Plus for 2 Units"

_TERM_2026_NOTE = (
    "Current term. Read from the Constellation portal plan detail 2026-08-10: "
    "plan name, fixed rate type, 12-month term, average rate, start and renewal "
    "dates, status Enrolled."
)

# The TDU charge is deliberately left NULL on every 2026 row. It is a
# pass-through the delivery utility re-tariffs mid-term, so neither the EFL's
# issue-date value (6.0009, now stale) nor a spot reading is a property of the
# contract. Only the supplier-fixed components are recorded here.
_EFL_2026_NOTE = (
    " Energy charge, early-termination fee and usage terms read from the plan's "
    "EFL (issued 12/5/2025) on 2026-08-11. TDU delivery is left NULL: it is a "
    "pass-through that re-tariffs mid-term, so no single value describes it."
)

_NO_EFL_NOTE = (
    " The EFL was not retrieved for this account — the portal's account list "
    "would not load. Its sibling at 6734 is on the identically-named plan with a "
    "$150 termination fee and a 10.00 c/kWh energy charge, but those are left "
    "NULL here rather than assumed: an inferred number in a money column reads "
    "as a measured one."
)

PEERLESS_UTILITY_PLANS: tuple[UtilityPlanSeedRow, ...] = (
    UtilityPlanSeedRow(
        property_match="6732 Peerless",
        service_type=SERVICE_TYPE_ELECTRICITY,
        provider_name=_CONSTELLATION,
        rate_type=RATE_TYPE_FIXED,
        account_number="204865879",
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
        notes=_SUPERSEDED_2025_NOTE,
    ),
    UtilityPlanSeedRow(
        property_match="6734 Peerless",
        service_type=SERVICE_TYPE_ELECTRICITY,
        provider_name=_CONSTELLATION,
        rate_type=RATE_TYPE_FIXED,
        account_number="204865622",
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
        notes=_SUPERSEDED_2025_NOTE,
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
            "Superseded by the 2026-02-17 term; kept as the rate baseline a new "
            "offer is measured against. From the 2025-01-27 plan-change notice, "
            "which does not state the average price at 1,000 kWh or the "
            "early-termination fee — both left blank rather than copied from "
            "the sibling properties. Term end derived as start + 12 months."
        ),
    ),
    # --- Current terms, all three enrolled 2026-02-17, renewing 2027-02-17. ---
    # These are what the renewal alert should be measuring. Seeding only the
    # 2025 rows left the app asserting every plan had lapsed in January 2026,
    # which fired a false alert for six months.
    UtilityPlanSeedRow(
        property_match="6732 Peerless",
        service_type=SERVICE_TYPE_ELECTRICITY,
        provider_name=_CONSTELLATION,
        rate_type=RATE_TYPE_FIXED,
        account_number="204865879",
        plan_name=_PLAN_2026_NO_MIN_FEE,
        avg_price_cents_per_kwh_at_1000=_AVG_RATE_2026_6732,
        term_months=12,
        service_start_date=_TERM_2026_START,
        term_end_date=_TERM_2026_END,
        # The plan name itself is the source: this plan carries no minimum-usage
        # fee, so there is no threshold for one to apply below.
        min_usage_fee_cents=0,
        notes=_TERM_2026_NOTE + _NO_EFL_NOTE,
    ),
    UtilityPlanSeedRow(
        property_match="6734 Peerless",
        service_type=SERVICE_TYPE_ELECTRICITY,
        provider_name=_CONSTELLATION,
        rate_type=RATE_TYPE_FIXED,
        account_number="204865622",
        plan_name=_PLAN_2026_NO_MIN_FEE,
        energy_charge_cents_per_kwh=_ENERGY_CHARGE_2026_6734,
        avg_price_cents_per_kwh_at_1000=_AVG_RATE_2026_6734,
        # The EFL states a $0.00 monthly base charge for this plan.
        monthly_base_charge_cents=0,
        term_months=12,
        service_start_date=_TERM_2026_START,
        term_end_date=_TERM_2026_END,
        early_termination_fee_cents=_ETF_2026_CENTS,
        min_usage_fee_cents=0,
        min_usage_threshold_kwh=_MIN_USAGE_THRESHOLD_KWH,
        notes=_TERM_2026_NOTE + _EFL_2026_NOTE,
    ),
    UtilityPlanSeedRow(
        property_match="6738 Peerless",
        service_type=SERVICE_TYPE_ELECTRICITY,
        provider_name=_CONSTELLATION,
        rate_type=RATE_TYPE_FIXED,
        account_number="204430810",
        plan_name=_PLAN_2026_AC_PROTECT,
        energy_charge_cents_per_kwh=_ENERGY_CHARGE_2026_6738,
        avg_price_cents_per_kwh_at_1000=_AVG_RATE_2026_6738,
        term_months=12,
        service_start_date=_TERM_2026_START,
        term_end_date=_TERM_2026_END,
        early_termination_fee_cents=_ETF_2026_CENTS,
        # The EFL states a 0.00000 minimum-usage fee per bill month without
        # naming a threshold, so only the fee is recorded.
        min_usage_fee_cents=0,
        has_bill_credit=True,
        bill_credit_amount_cents=_BILL_CREDIT_6738_CENTS,
        bill_credit_threshold_kwh=_BILL_CREDIT_6738_THRESHOLD_KWH,
        notes=(
            _TERM_2026_NOTE + _EFL_2026_NOTE + " The EFL's full plan title is "
            "'12 Month Residential Fixed Rate with Usage Bill Credit + AC "
            "Protection for 2 Units and HVAC Monitoring, Heating System Coverage "
            "2, Water Heater Coverage 1' — the portal shows only a fragment. The "
            "bundled coverage is priced into the 14.11 c/kWh energy charge, which "
            "is why this account's average runs above the other two for the same "
            "commodity. It also carries a SECOND usage credit of $15.00 per bill "
            "month above 2,000 kWh that the single credit pair on this table "
            "cannot represent; only the $35.00-above-1,000-kWh tier is recorded, "
            "so a comparison understates this plan's credits in a 2,000+ kWh "
            "month."
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
