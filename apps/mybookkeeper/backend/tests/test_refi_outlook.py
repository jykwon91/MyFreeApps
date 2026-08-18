"""The verdict logic, exercised on the operator's three real loans.

Two things are being guarded here, and only one of them is arithmetic:

* A loan this feed cannot cover must come back as an ANSWER with a reason, not
  vanish. The insurance version shipped without that and three handled policies
  read as one handled and two skipped.
* A real rate gap whose closing costs take years to repay must not be reported
  as an opportunity. That is the case a rate-only comparison gets wrong, and on
  these statements it is the common one.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from app.core.mortgage_enums import (
    RATE_TYPE_ARM,
    RATE_TYPE_FIXED,
    TERM_MONTHS_15_YEAR,
    TERM_MONTHS_30_YEAR,
    VERDICT_MARGINAL,
    VERDICT_NO_ACTION,
    VERDICT_NOT_CHECKABLE,
    VERDICT_WORTH_PRICING,
)
from app.core.pmms_rate_constants import (
    REASON_ADJUSTABLE_RATE,
    REASON_NO_BALANCE_RECORDED,
    REASON_NO_RATE_RECORDED,
    REASON_NO_TERM_RECORDED,
    REASON_PROPERTY_UNCLASSIFIED,
    SERIES_15_YEAR,
    SERIES_30_YEAR,
)
from app.models.mortgage.mortgage import Mortgage
from app.schemas.mortgage.mortgage_rate_observation import MortgageRateObservation
from app.schemas.mortgage.mortgage_rate_survey import MortgageRateSurvey
from app.services.mortgage._refi_outlook import (
    build_refi_outlook,
    remaining_term_months,
)

TODAY = _dt.date(2026, 8, 17)

# Live figures from the FRED export on 2026-08-17, observed 2026-08-13.
SURVEY = MortgageRateSurvey(
    thirty_year=MortgageRateObservation(
        series_id=SERIES_30_YEAR,
        term_months=TERM_MONTHS_30_YEAR,
        rate_pct=Decimal("6.67"),
        observed_on=_dt.date(2026, 8, 13),
    ),
    fifteen_year=MortgageRateObservation(
        series_id=SERIES_15_YEAR,
        term_months=TERM_MONTHS_15_YEAR,
        rate_pct=Decimal("5.96"),
        observed_on=_dt.date(2026, 8, 13),
    ),
)


def _loan(**overrides) -> Mortgage:
    """A loan row with only the columns the comparison reads."""
    fields = {
        "id": uuid.uuid4(),
        "property_id": uuid.uuid4(),
        "lender": "TDECU",
        "rate_type": RATE_TYPE_FIXED,
        "interest_rate": Decimal("7.125"),
        "current_balance_cents": 33613735,
        "maturity_date": None,
        "monthly_principal_cents": 30156,
        "monthly_interest_cents": 199582,
    }
    fields.update(overrides)
    return Mortgage(**fields)


class TestRemainingTermMonths:
    def test_prefers_the_stated_payoff_date(self) -> None:
        """6738 Peerless states 02/2051 and implies 282 — the date wins.

        The gap is the borrower paying over the scheduled amount. Trusting the
        implied figure would price the replacement loan a year short and
        overstate its payment.
        """
        loan = _loan(
            interest_rate=Decimal("2.990"),
            current_balance_cents=7846278,
            maturity_date=_dt.date(2051, 2, 1),
            monthly_principal_cents=19209,
            monthly_interest_cents=19550,
        )
        assert remaining_term_months(loan, today=TODAY) == 293

    def test_falls_back_to_the_payment_when_no_payoff_date(self) -> None:
        assert remaining_term_months(_loan(), today=TODAY) == 343

    def test_none_when_neither_is_recorded(self) -> None:
        loan = _loan(monthly_principal_cents=None, monthly_interest_cents=None)
        assert remaining_term_months(loan, today=TODAY) is None

    def test_a_matured_loan_is_not_a_zero_month_loan(self) -> None:
        """A payoff date in the past yields nothing, not a term of zero.

        Zero would divide through the payment formula; ``None`` routes it to
        the "how many payments are left isn't recorded" answer instead.
        """
        loan = _loan(maturity_date=_dt.date(2020, 1, 1))
        assert remaining_term_months(loan, today=TODAY) is None


def _outlook(loan: Mortgage, classification: str = "investment"):
    return build_refi_outlook(
        loan,
        property_name="6734 Peerless",
        classification=classification,
        survey=SURVEY,
        today=TODAY,
    )


class TestUncheckableLoansStillAnswer:
    def test_arm_says_why_rather_than_disappearing(self) -> None:
        """6732 Peerless: 'Interest Rate Until February, 2035'."""
        outlook = _outlook(
            _loan(rate_type=RATE_TYPE_ARM, fixed_until=_dt.date(2035, 2, 1)),
        )
        assert outlook.is_checkable is False
        assert outlook.verdict == VERDICT_NOT_CHECKABLE
        assert outlook.unavailable_reason == REASON_ADJUSTABLE_RATE

    def test_missing_rate(self) -> None:
        outlook = _outlook(_loan(interest_rate=None))
        assert outlook.unavailable_reason == REASON_NO_RATE_RECORDED

    def test_missing_balance(self) -> None:
        outlook = _outlook(_loan(current_balance_cents=None))
        assert outlook.unavailable_reason == REASON_NO_BALANCE_RECORDED

    def test_unclassified_property(self) -> None:
        """The blocker the page offers to fix in place."""
        outlook = _outlook(_loan(), classification="unclassified")
        assert outlook.unavailable_reason == REASON_PROPERTY_UNCLASSIFIED

    def test_no_way_to_count_remaining_payments(self) -> None:
        outlook = _outlook(
            _loan(monthly_principal_cents=None, monthly_interest_cents=None),
        )
        assert outlook.unavailable_reason == REASON_NO_TERM_RECORDED

    def test_every_uncheckable_loan_still_carries_its_own_rate(self) -> None:
        """The card is not blank — it still shows what the operator holds."""
        outlook = _outlook(_loan(rate_type=RATE_TYPE_ARM))
        assert outlook.current_rate_pct == Decimal("7.125")
        assert outlook.current_balance_cents == 33613735
        assert outlook.property_name == "6734 Peerless"


class TestOccupancyAdjustment:
    def test_a_rental_is_compared_against_the_survey_plus_a_band(self) -> None:
        outlook = _outlook(_loan(), classification="investment")
        assert outlook.comparable_rate_low_pct == Decimal("7.07")
        assert outlook.comparable_rate_high_pct == Decimal("7.52")

    def test_a_second_home_prices_identically_to_a_rental(self) -> None:
        """Fannie Mae's matrix gives them the same row, value for value.

        Assuming a second home sits nearer a primary residence produces a
        confidently wrong verdict on one.
        """
        rental = _outlook(_loan(), classification="investment")
        second = _outlook(_loan(), classification="second_home")
        assert second.comparable_rate_low_pct == rental.comparable_rate_low_pct
        assert second.comparable_rate_high_pct == rental.comparable_rate_high_pct

    def test_a_primary_residence_is_compared_to_the_survey_itself(self) -> None:
        outlook = _outlook(_loan(), classification="primary_residence")
        assert outlook.comparable_rate_low_pct == Decimal("6.67")
        assert outlook.comparable_rate_high_pct == Decimal("6.67")


class TestVerdicts:
    def test_6734_peerless_as_a_rental_has_nothing_to_do(self) -> None:
        """7.125% against a comparable 7.07–7.52% is inside the noise."""
        outlook = _outlook(_loan(), classification="investment")
        assert outlook.verdict == VERDICT_NO_ACTION

    def test_the_same_loan_as_a_primary_residence_is_only_marginal(self) -> None:
        """The case a rate-only comparison gets wrong.

        7.125% against 6.67% is a real 0.455-point gap, and the payment does
        fall. It still is not worth doing: closing costs on a $336k balance run
        $6.7k–$16.8k against about $100 a month, so the break-even runs years
        past the ceiling.
        """
        outlook = _outlook(_loan(), classification="primary_residence")
        assert outlook.verdict == VERDICT_MARGINAL
        assert outlook.monthly_saving_low_cents > 0
        assert outlook.breakeven_high_months is not None
        assert outlook.breakeven_high_months > 36

    def test_a_loan_far_above_market_is_worth_pricing(self) -> None:
        """A gap wide enough that even the pessimistic costs earn back fast.

        Same balance and term as above at 11.5%. The payment falls by over a
        thousand a month, so $16.8k of closing costs are repaid inside two
        years — which is what separates this from the marginal case, not the
        size of the rate gap on its own.

        The payoff date is stated rather than implied: a payment that low
        against 11.5% interest would not amortise at all, and the loan would
        route to "how many payments are left isn't recorded" instead.
        """
        outlook = _outlook(
            _loan(
                interest_rate=Decimal("11.500"),
                maturity_date=_dt.date(2055, 3, 17),
            ),
            classification="primary_residence",
        )
        assert outlook.verdict == VERDICT_WORTH_PRICING
        assert outlook.breakeven_high_months is not None
        assert outlook.breakeven_high_months <= 36

    def test_2_99_percent_is_never_beatable(self) -> None:
        """6738 Peerless. Nothing in this market touches it."""
        outlook = _outlook(
            _loan(
                interest_rate=Decimal("2.990"),
                current_balance_cents=7846278,
                maturity_date=_dt.date(2051, 2, 1),
            ),
        )
        assert outlook.verdict == VERDICT_NO_ACTION
        assert outlook.monthly_saving_high_cents < 0

    def test_savings_are_ordered_low_then_high(self) -> None:
        """``low``/``high`` name the FIGURE, not the rate it came from."""
        outlook = _outlook(_loan(), classification="primary_residence")
        assert outlook.monthly_saving_low_cents <= outlook.monthly_saving_high_cents
        assert outlook.new_payment_low_cents <= outlook.new_payment_high_cents
        assert outlook.closing_cost_low_cents <= outlook.closing_cost_high_cents


class TestSurveyTermSelection:
    def test_a_long_loan_is_measured_against_the_30_year(self) -> None:
        outlook = _outlook(_loan())
        assert outlook.survey_term_months == TERM_MONTHS_30_YEAR
        assert outlook.survey_rate_pct == Decimal("6.67")

    def test_a_short_loan_is_measured_against_the_15_year(self) -> None:
        """Refinancing eleven years of payments into a fresh thirty is a
        different transaction, and is priced differently."""
        outlook = _outlook(_loan(maturity_date=_dt.date(2037, 8, 17)))
        assert outlook.survey_term_months == TERM_MONTHS_15_YEAR
        assert outlook.survey_rate_pct == Decimal("5.96")
