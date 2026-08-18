"""Turn one loan plus one survey reading into a verdict.

Pure: takes a ``Mortgage`` row, a property classification, a survey and today's
date, returns a ``MortgageRefiOutlook``. No session, no network, no clock — so
the interesting cases can be tested against real statement figures directly.

Nothing here decides what to SAY. Every string the operator reads is a constant
in ``app/core/pmms_rate_constants.py`` or is composed in the frontend from
these numbers.
"""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

from app.core.mortgage_enums import (
    RATE_TYPE_ARM,
    VERDICT_MARGINAL,
    VERDICT_NO_ACTION,
    VERDICT_NOT_CHECKABLE,
    VERDICT_WORTH_PRICING,
)
from app.core.pmms_rate_constants import (
    BREAKEVEN_ALERT_CEILING_MONTHS,
    CLOSING_COST_HIGH_PCT,
    CLOSING_COST_LOW_PCT,
    MIN_NOTABLE_RATE_DELTA_PCT,
    OCCUPANCY_RATE_ADDON_PCT,
    REASON_ADJUSTABLE_RATE,
    REASON_NO_BALANCE_RECORDED,
    REASON_NO_RATE_RECORDED,
    REASON_NO_TERM_RECORDED,
    REASON_PROPERTY_UNCLASSIFIED,
)
from app.models.mortgage.mortgage import Mortgage
from app.schemas.mortgage.mortgage_rate_survey import MortgageRateSurvey
from app.schemas.mortgage.mortgage_refi_outlook import MortgageRefiOutlook
from app.services.mortgage.refi_math import (
    breakeven_months,
    monthly_payment_cents,
    months_between,
    term_implied_by_payment,
)

_HUNDRED = Decimal(100)


def _unavailable(
    mortgage: Mortgage, property_name: str, reason: str,
) -> MortgageRefiOutlook:
    return MortgageRefiOutlook(
        mortgage_id=mortgage.id,
        property_id=mortgage.property_id,
        property_name=property_name,
        lender=mortgage.lender,
        rate_type=mortgage.rate_type,
        current_rate_pct=mortgage.interest_rate,
        current_balance_cents=mortgage.current_balance_cents,
        is_checkable=False,
        unavailable_reason=reason,
        verdict=VERDICT_NOT_CHECKABLE,
    )


def remaining_term_months(mortgage: Mortgage, *, today: _dt.date) -> int | None:
    """How many payments are left.

    The stated payoff date wins over the one implied by the payment, and that
    order was chosen from the real statements rather than by preference. The
    6738 Peerless statement gives both: a maturity of 02/2051 (294 months out)
    and a payment that implies 282. The twelve-month gap is the borrower paying
    a few dollars over the scheduled amount, which the implied calculation
    reads as a shorter loan. The lender's own payoff date is the fact; the
    implied term is the fallback for the statements that omit it.
    """
    if mortgage.maturity_date is not None:
        months = months_between(today, mortgage.maturity_date)
        return months or None

    if (
        mortgage.current_balance_cents
        and mortgage.interest_rate is not None
        and mortgage.monthly_principal_cents is not None
        and mortgage.monthly_interest_cents is not None
    ):
        return term_implied_by_payment(
            mortgage.current_balance_cents,
            mortgage.interest_rate,
            mortgage.monthly_principal_cents + mortgage.monthly_interest_cents,
        )

    return None


def build_refi_outlook(
    mortgage: Mortgage,
    *,
    property_name: str,
    classification: str,
    survey: MortgageRateSurvey,
    today: _dt.date,
) -> MortgageRefiOutlook:
    """Compare one loan to the market, or say why it can't be compared."""
    if mortgage.rate_type == RATE_TYPE_ARM:
        return _unavailable(mortgage, property_name, REASON_ADJUSTABLE_RATE)

    if mortgage.interest_rate is None:
        return _unavailable(mortgage, property_name, REASON_NO_RATE_RECORDED)

    if not mortgage.current_balance_cents:
        return _unavailable(mortgage, property_name, REASON_NO_BALANCE_RECORDED)

    addon = OCCUPANCY_RATE_ADDON_PCT.get(classification)
    if addon is None:
        return _unavailable(
            mortgage, property_name, REASON_PROPERTY_UNCLASSIFIED,
        )

    remaining = remaining_term_months(mortgage, today=today)
    if remaining is None:
        return _unavailable(mortgage, property_name, REASON_NO_TERM_RECORDED)

    observation = survey.for_term(remaining)
    comparable_low = observation.rate_pct + Decimal(str(addon[0]))
    comparable_high = observation.rate_pct + Decimal(str(addon[1]))

    balance = mortgage.current_balance_cents
    current_rate = mortgage.interest_rate

    # The payment as scheduled, not as paid. A borrower sending extra principal
    # would otherwise be compared against their own overpayment and told the
    # refinance saves less than it does.
    current_payment = monthly_payment_cents(balance, current_rate, remaining)

    payment_at_low = monthly_payment_cents(balance, comparable_low, remaining)
    payment_at_high = monthly_payment_cents(balance, comparable_high, remaining)

    # The cheaper rate produces the bigger saving, so the naming crosses over.
    saving_high = current_payment - payment_at_low
    saving_low = current_payment - payment_at_high

    closing_low = int(balance * Decimal(str(CLOSING_COST_LOW_PCT)) / _HUNDRED)
    closing_high = int(balance * Decimal(str(CLOSING_COST_HIGH_PCT)) / _HUNDRED)

    # Best case: the biggest saving against the smallest cost.
    breakeven_low = breakeven_months(saving_high, closing_low)
    breakeven_high = breakeven_months(saving_low, closing_high)

    minimum_gap = Decimal(str(MIN_NOTABLE_RATE_DELTA_PCT))
    best_case_gap = current_rate - comparable_low
    worst_case_gap = current_rate - comparable_high

    if best_case_gap < minimum_gap:
        verdict = VERDICT_NO_ACTION
    elif (
        worst_case_gap >= minimum_gap
        and breakeven_high is not None
        and breakeven_high <= BREAKEVEN_ALERT_CEILING_MONTHS
    ):
        # Above market at both ends of the band, and it pays for itself inside
        # the ceiling even on the pessimistic cost assumption.
        verdict = VERDICT_WORTH_PRICING
    else:
        verdict = VERDICT_MARGINAL

    return MortgageRefiOutlook(
        mortgage_id=mortgage.id,
        property_id=mortgage.property_id,
        property_name=property_name,
        lender=mortgage.lender,
        rate_type=mortgage.rate_type,
        current_rate_pct=current_rate,
        current_balance_cents=balance,
        is_checkable=True,
        unavailable_reason=None,
        verdict=verdict,
        survey_rate_pct=observation.rate_pct,
        survey_term_months=observation.term_months,
        survey_observed_on=observation.observed_on,
        comparable_rate_low_pct=comparable_low,
        comparable_rate_high_pct=comparable_high,
        remaining_term_months=remaining,
        current_payment_cents=current_payment,
        new_payment_low_cents=payment_at_low,
        new_payment_high_cents=payment_at_high,
        monthly_saving_low_cents=saving_low,
        monthly_saving_high_cents=saving_high,
        closing_cost_low_cents=closing_low,
        closing_cost_high_cents=closing_high,
        breakeven_low_months=breakeven_low,
        breakeven_high_months=breakeven_high,
    )
