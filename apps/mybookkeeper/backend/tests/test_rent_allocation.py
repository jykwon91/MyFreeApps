"""Unit tests for FIFO payment allocation.

The scenario that drove this feature is ``test_weekly_payments_fill_a_monthly_charge``:
a tenant charged $1,500 monthly who pays $375 a week. Everything else here
guards the edges around it — partial coverage, spill into the next period,
credit, waivers, and the overdue rule.
"""
from __future__ import annotations

import datetime as _dt
from decimal import Decimal

from app.services.rent.rent_allocation import (
    ChargeInput,
    PaymentInput,
    allocate,
)

AUG = ChargeInput(
    id="aug",
    due_date=_dt.date(2026, 8, 1),
    period_end=_dt.date(2026, 8, 31),
    amount=Decimal("1500.00"),
)
SEP = ChargeInput(
    id="sep",
    due_date=_dt.date(2026, 9, 1),
    period_end=_dt.date(2026, 9, 30),
    amount=Decimal("1500.00"),
)


def _weekly(count: int, amount: str = "375.00") -> list[PaymentInput]:
    return [
        PaymentInput(
            id=f"p{i}",
            paid_on=_dt.date(2026, 8, 3) + _dt.timedelta(days=7 * i),
            amount=Decimal(amount),
        )
        for i in range(count)
    ]


class TestWeeklyPayerOnMonthlyCharge:
    def test_weekly_payments_fill_a_monthly_charge(self) -> None:
        result = allocate([AUG, SEP], _weekly(5))
        aug, sep = result.settlements

        assert aug.allocated == Decimal("1500.00")
        assert aug.remaining == Decimal("0.00")
        assert len(aug.applications) == 4
        # The fifth payment spills into September.
        assert sep.allocated == Decimal("375.00")
        assert sep.remaining == Decimal("1125.00")

    def test_partial_month_reports_progress_not_delinquency(self) -> None:
        """Three of four weekly payments in: on track, not overdue."""
        result = allocate([AUG], _weekly(3))
        aug = result.settlements[0]

        assert aug.allocated == Decimal("1125.00")
        assert aug.remaining == Decimal("375.00")
        assert aug.status(_dt.date(2026, 8, 20)) == "partial"

    def test_short_at_period_end_is_overdue(self) -> None:
        result = allocate([AUG], _weekly(3))
        assert result.settlements[0].status(_dt.date(2026, 9, 2)) == "overdue"

    def test_balance_is_charged_minus_paid(self) -> None:
        result = allocate([AUG, SEP], _weekly(5))
        assert result.total_charged == Decimal("3000.00")
        assert result.total_allocated == Decimal("1875.00")
        assert result.balance == Decimal("1125.00")


class TestSpillAndCredit:
    def test_one_payment_can_span_two_charges(self) -> None:
        big = [PaymentInput(id="big", paid_on=_dt.date(2026, 8, 5), amount=Decimal("2000.00"))]
        result = allocate([AUG, SEP], big)

        assert result.settlements[0].allocated == Decimal("1500.00")
        assert result.settlements[1].allocated == Decimal("500.00")
        # The same payment appears against both charges.
        assert result.settlements[0].applications[0].payment_id == "big"
        assert result.settlements[1].applications[0].payment_id == "big"

    def test_overpayment_becomes_unapplied_credit(self) -> None:
        result = allocate([AUG], _weekly(5))
        assert result.settlements[0].allocated == Decimal("1500.00")
        assert result.total_unapplied == Decimal("375.00")
        # A credit shows as a negative balance, not an error.
        assert result.balance == Decimal("-375.00")

    def test_no_charges_leaves_every_payment_unapplied(self) -> None:
        result = allocate([], _weekly(2))
        assert result.total_unapplied == Decimal("750.00")
        assert result.balance == Decimal("-750.00")

    def test_no_payments_leaves_charge_open(self) -> None:
        result = allocate([AUG], [])
        assert result.settlements[0].allocated == Decimal("0.00")
        assert result.settlements[0].status(_dt.date(2026, 8, 10)) == "open"


class TestOrdering:
    def test_oldest_charge_is_filled_first_regardless_of_input_order(self) -> None:
        result = allocate([SEP, AUG], _weekly(4))
        by_id = {s.charge_id: s for s in result.settlements}
        assert by_id["aug"].allocated == Decimal("1500.00")
        assert by_id["sep"].allocated == Decimal("0.00")

    def test_charges_sharing_a_due_date_use_the_tiebreak(self) -> None:
        a = ChargeInput(
            id="a", due_date=_dt.date(2026, 8, 1), period_end=_dt.date(2026, 8, 31),
            amount=Decimal("100.00"), sort_key=(1,),
        )
        b = ChargeInput(
            id="b", due_date=_dt.date(2026, 8, 1), period_end=_dt.date(2026, 8, 31),
            amount=Decimal("100.00"), sort_key=(0,),
        )
        pay = [PaymentInput(id="p", paid_on=_dt.date(2026, 8, 2), amount=Decimal("100.00"))]
        result = allocate([a, b], pay)
        by_id = {s.charge_id: s for s in result.settlements}
        # Lower sort_key wins, deterministically.
        assert by_id["b"].allocated == Decimal("100.00")
        assert by_id["a"].allocated == Decimal("0.00")


class TestWaivers:
    def test_waived_charge_absorbs_nothing_and_leaves_balance_clear(self) -> None:
        waived = ChargeInput(
            id="aug", due_date=_dt.date(2026, 8, 1),
            period_end=_dt.date(2026, 8, 31), amount=Decimal("1500.00"),
            is_waived=True,
        )
        result = allocate([waived, SEP], _weekly(4))
        by_id = {s.charge_id: s for s in result.settlements}

        assert by_id["aug"].allocated == Decimal("0.00")
        assert by_id["aug"].status(_dt.date(2026, 9, 15)) == "waived"
        # Payments flow past the waived charge into September.
        assert by_id["sep"].allocated == Decimal("1500.00")
        # A waived charge is not owed.
        assert result.total_charged == Decimal("1500.00")
        assert result.balance == Decimal("0.00")


class TestOverdueRule:
    def test_grace_period_makes_overdue_fire_early(self) -> None:
        strict = ChargeInput(
            id="aug", due_date=_dt.date(2026, 8, 1),
            period_end=_dt.date(2026, 8, 31), amount=Decimal("1500.00"),
            overdue_after=_dt.date(2026, 8, 5),
        )
        result = allocate([strict], _weekly(1))
        assert result.settlements[0].status(_dt.date(2026, 8, 4)) == "partial"
        assert result.settlements[0].status(_dt.date(2026, 8, 6)) == "overdue"

    def test_fully_paid_is_never_overdue(self) -> None:
        result = allocate([AUG], _weekly(4))
        assert result.settlements[0].status(_dt.date(2027, 1, 1)) == "paid"
