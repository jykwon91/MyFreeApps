"""Amortisation arithmetic, checked against the operator's own statements.

The figures below are read off three real mortgage statements rather than
invented, because the failure this guards against is arithmetic that is
self-consistent and wrong. A payment formula that agrees with itself will
happily tell someone to refinance a loan they cannot beat.
"""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

from app.services.mortgage.refi_math import (
    breakeven_months,
    monthly_payment_cents,
    months_between,
    monthly_rate,
    term_implied_by_payment,
)


class TestMonthlyRate:
    def test_divides_by_twelve_hundred(self) -> None:
        assert monthly_rate(Decimal("6.00")) == Decimal("6.00") / Decimal(1200)

    def test_zero_rate_is_zero(self) -> None:
        assert monthly_rate(Decimal("0")) == 0


class TestMonthlyPaymentCents:
    def test_matches_the_6734_peerless_statement(self) -> None:
        """$336,137.35 at 7.125% over the implied 343 months.

        The statement prints principal $301.56 + interest $1,995.82 =
        $2,297.38. Recomputing that payment from the balance, the rate and the
        term it implies has to land on the same cent, or the model of the loan
        disagrees with the lender's.
        """
        balance = 33613735
        rate = Decimal("7.125")
        term = term_implied_by_payment(balance, rate, 229738)
        assert term == 343
        assert monthly_payment_cents(balance, rate, term) == 229738

    def test_zero_rate_is_straight_line(self) -> None:
        assert monthly_payment_cents(120000, Decimal("0"), 12) == 10000

    def test_zero_principal_is_zero(self) -> None:
        assert monthly_payment_cents(0, Decimal("6.5"), 360) == 0


class TestMonthsBetween:
    def test_counts_whole_months(self) -> None:
        assert months_between(_dt.date(2026, 8, 17), _dt.date(2027, 8, 17)) == 12

    def test_partial_month_does_not_count(self) -> None:
        # The 16th has not come round yet, so that payment is still owed.
        assert months_between(_dt.date(2026, 8, 17), _dt.date(2027, 8, 16)) == 11

    def test_past_date_floors_at_zero(self) -> None:
        assert months_between(_dt.date(2026, 8, 17), _dt.date(2020, 1, 1)) == 0


class TestTermImpliedByPayment:
    def test_reads_the_6738_peerless_statement(self) -> None:
        """$78,462.78 at 2.99%, paying $192.09 + $195.50.

        The lender's own maturity is 02/2051 — 294 months from this statement —
        but the payment implies 282. That twelve-month gap is the borrower
        paying a few dollars over the scheduled amount, and it is exactly why
        ``remaining_term_months`` prefers the stated payoff date.
        """
        assert term_implied_by_payment(7846278, Decimal("2.990"), 38759) == 282

    def test_payment_below_one_months_interest_never_amortises(self) -> None:
        # $100,000 at 6% accrues $500 a month; $400 does not touch principal.
        assert term_implied_by_payment(10000000, Decimal("6.0"), 40000) is None

    def test_zero_payment_is_none(self) -> None:
        assert term_implied_by_payment(10000000, Decimal("6.0"), 0) is None


class TestBreakevenMonths:
    def test_rounds_up_to_a_whole_payment(self) -> None:
        # $100/mo against $250 of costs: three payments, not two and a half.
        assert breakeven_months(10000, 25000) == 3

    def test_no_saving_never_breaks_even(self) -> None:
        assert breakeven_months(0, 500000) is None
        assert breakeven_months(-100, 500000) is None

    def test_free_refinance_breaks_even_immediately(self) -> None:
        assert breakeven_months(10000, 0) == 0
