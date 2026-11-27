"""Where a payment in came from, on payee strings shaped like a real bank feed. Pure."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from app.repositories.cash_flow.income_row import IncomeRow
from app.services.personal_finances import income_kinds

SEP, OCT = _dt.date(2026, 9, 1), _dt.date(2026, 10, 1)


def _in(
    amount: str, day: _dt.date, vendor: str, *, scope: str = "personal", category: str = "uncategorized",
) -> IncomeRow:
    return IncomeRow(
        id=uuid.uuid4(), transaction_date=day, amount=Decimal(amount), vendor=vendor, description=None,
        category=category, transaction_scope=scope,
    )


def _kinds(rows: list[IncomeRow], employers: tuple[str, ...] = ()) -> list[str]:
    context = income_kinds.income_context(rows, employers)
    return [income_kinds.income_kind(row, context) for row in rows]


class TestRent:
    def test_rental_scope_or_rental_revenue_is_rent_whoever_paid(self) -> None:
        rows = [
            _in("1200", OCT, "VELLO LLC DD PPD", scope="rental"),
            _in("900", OCT, "Zelle payment from Pat Tenant", category="rental_revenue"),
        ]
        assert _kinds(rows) == ["rental", "rental"]

    def test_a_property_manager_scoped_personal_is_still_rent(self) -> None:
        rows = [_in("1200", SEP, "VELLO LLC DD PPD", scope="rental"), _in("1200", OCT, "VELLO LLC DD PPD")]
        assert _kinds(rows) == ["rental", "rental"]

    def test_a_payer_never_seen_paying_rent_is_not(self) -> None:
        assert _kinds([_in("1200", OCT, "VELLO LLC Client Per")]) == ["other"]


class TestPay:
    def test_payroll_companies_and_the_payroll_word_are_pay(self) -> None:
        rows = [_in("1", OCT, "PAYCHEX INC PAYROLL"), _in("1", OCT, "Paycor Direct Dep"), _in("1", OCT, "ACME PAYROLL")]
        assert _kinds(rows) == ["salary", "salary", "salary"]

    def test_a_w2_employer_is_pay_however_the_bank_spells_it(self) -> None:
        rows = [_in("1540", SEP, "ONEONCOLOGY LLC AP PAY"), _in("1540", OCT, "ONEONCOLOGY AP PAY")]
        assert _kinds(rows, employers=("OneOncology, LLC",)) == ["salary", "salary"]

    def test_part_of_a_word_is_not_a_match(self) -> None:
        # "adp" inside another word, and an employer named only by filler words.
        assert _kinds([_in("1", OCT, "ADPATCH STUDIO")], employers=("The Co",)) == ["other"]

    def test_without_the_w2_the_employer_is_other(self) -> None:
        assert _kinds([_in("1540", SEP, "ONEONCOLOGY LLC AP PAY")]) == ["other"]


class TestOneOffs:
    def test_a_large_payment_from_a_payer_seen_once_is_a_one_off(self) -> None:
        rows = [_in("18279.00", OCT, "CHARLES SCHWAB T BENEF"), _in("5000", OCT, "PAYCHEX")]
        assert _kinds(rows) == ["one_off", "salary"]

    def test_a_payer_who_pays_in_another_month_is_not(self) -> None:
        assert _kinds([_in("3000", SEP, "Side gig LLC"), _in("3000", OCT, "Side gig LLC")]) == ["other", "other"]

    def test_small_amounts_pay_and_rent_are_not(self) -> None:
        rows = [
            _in("2499.99", OCT, "Gift"),
            _in("9000", OCT, "PAYCHEX"),
            _in("9000", OCT, "Tenant", scope="rental"),
        ]
        assert _kinds(rows) == ["other", "salary", "rental"]

    def test_a_single_large_rent_payment_is_rent_not_a_one_off(self) -> None:
        rows = [_in("9000", SEP, "VELLO LLC DD PPD", scope="rental"), _in("9000", OCT, "VELLO LLC DD PPD")]
        assert _kinds(rows) == ["rental", "rental"]
