"""The monthly expenses rules, as pure functions.

Pinned, for the bank-twin rule, every combination of its keys: an
account-less row and a bank row of the same type and amount within four days
are one payment; a different type, a different amount, five days apart, a row
that has an account, and two bank rows are never merged; each bank row covers
one other row only. For the spending rules: what each kind of
loan, card and transfer row counts as; the heading's order of preference; and
the months and averages.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from app.repositories.monthly_expenses.card_payment_arrival import CardPaymentArrival
from app.repositories.monthly_expenses.expense_row import ExpenseRow
from app.services.monthly_expenses import bank_twins, expense_rules, monthly_expense_breakdown
from app.services.monthly_expenses.counted_expense import CountedExpense
from app.services.monthly_expenses.expense_context import ExpenseContext
from app.services.monthly_expenses import monthly_expense_detail
from app.mappers.monthly_expense_mapper import payee_for, to_transaction_response

DAY = _dt.date(2026, 10, 10)
CHECKING = uuid.uuid4()
HOLDER = uuid.uuid4()
HOLDERS = {HOLDER: "Jason Kwon"}


def _row(amount: str = "50.00", *, day: _dt.date = DAY, **overrides: object) -> ExpenseRow:
    values: dict[str, object] = {
        "id": uuid.uuid4(),
        "transaction_date": day,
        "amount": Decimal(amount),
        "transaction_type": "expense",
        "external_source": "plaid",
        "external_category": None,
        "category": "other_expense",
        "spending_category_name": None,
        "description": None,
        "vendor": None,
        "account_id": CHECKING,
        "account_type": "checking",
        "account_name": "TDECU Checking",
        "account_institution": "TDECU",
        "account_mask": "4821",
        "account_user_id": HOLDER,
        "to_account_type": None,
    }
    values.update(overrides)
    return ExpenseRow(**values)  # type: ignore[arg-type]


def _emailed(amount: str = "50.00", *, day: _dt.date = DAY, **overrides: object) -> ExpenseRow:
    values: dict[str, object] = {"external_source": None, "account_id": None, "account_type": None, "account_user_id": None}
    values.update(overrides)
    return _row(amount, day=day, **values)


def _after(days: int) -> _dt.date:
    return DAY + _dt.timedelta(days=days)


def _label(
    row: ExpenseRow,
    *,
    mortgages: frozenset[int] = frozenset(),
    cards: frozenset[uuid.UUID] = frozenset(),
    holders: dict[uuid.UUID, str] = HOLDERS,
) -> str | None:
    context = ExpenseContext(mortgage_payments=mortgages, card_payments=cards, holder_names=holders)
    return expense_rules.expense_label(row, context)


class TestBankTwins:
    def test_an_emailed_row_the_bank_also_sent_counts_once(self) -> None:
        bank = _row(day=_after(4))
        assert bank_twins.drop_bank_twins([_emailed(), bank]) == [bank]

    def test_rows_that_differ_in_any_key_are_both_kept(self) -> None:
        cases = [
            [_emailed(), _row(day=_after(5))],
            [_emailed(), _row("50.01")],
            [_emailed(), _row(transaction_type="transfer")],
            [_emailed(account_id=CHECKING), _row()],
            [_row(), _row()],
            [_emailed(), _emailed()],
        ]
        for rows in cases:
            assert bank_twins.drop_bank_twins(rows) == rows

    def test_each_bank_row_covers_one_other_row_only(self) -> None:
        early, late = _emailed(day=_after(-2)), _emailed(day=_after(1))
        bank = _row()
        assert bank_twins.drop_bank_twins([early, late, bank]) == [late, bank]

    def test_two_bank_rows_cover_two_emailed_rows(self) -> None:
        first, second = _row(), _row(day=_after(1))
        assert bank_twins.drop_bank_twins([_emailed(), _emailed(day=_after(1)), first, second]) == [first, second]


class TestLoansAndCards:
    def test_a_transfer_into_a_loan_or_mortgage_account_is_a_payment(self) -> None:
        assert _label(_row(transaction_type="transfer", to_account_type="mortgage")) == "Mortgage"
        assert _label(_row(transaction_type="transfer", to_account_type="loan")) == "Car & other loans"
        assert _label(_row(transaction_type="transfer", to_account_type="other_liability")) == "Car & other loans"

    def test_a_transfer_into_a_card_or_your_own_account_is_not_spending(self) -> None:
        assert _label(_row(transaction_type="transfer", to_account_type="credit_card")) is None
        assert _label(_row(transaction_type="transfer", to_account_type="savings")) is None
        assert _label(_row("2500.00", transaction_type="transfer", to_account_type="savings"), mortgages=frozenset({2500_00})) is None

    def test_a_mortgage_payment_is_recognised_by_its_amount(self) -> None:
        mortgages = expense_rules.mortgage_payment_cents([(1500_00, 700_00, 300_00), (100_00, None, 5_00)])
        assert mortgages == frozenset({2500_00})
        for row in (
            _row("2500.00", transaction_type="transfer"),
            _row("2500.00", external_category="TRANSFER_OUT", description="Jason Kwon External F"),
            _row("2500.00", external_category="LOAN_PAYMENTS"),
        ):
            assert _label(row, mortgages=mortgages) == "Mortgage"
        # A purchase that happens to cost the same is still a purchase.
        assert _label(_row("2500.00", external_category="TRAVEL"), mortgages=mortgages) == "Travel"
        assert _label(_row("2500.00", transaction_type="transfer", account_type="credit_card"), mortgages=mortgages) is None

    def test_an_unpaired_loan_payment_counts_unless_it_paid_a_card(self) -> None:
        loan = _row("450.00", external_category="LOAN_PAYMENTS")
        card_payment = _row("900.00", day=_after(1), external_category="LOAN_PAYMENTS")
        arrivals = [CardPaymentArrival(transaction_date=_after(3), amount=Decimal("900.00"))]
        cards = expense_rules.card_payment_ids([loan, card_payment], arrivals)
        assert cards == frozenset({card_payment.id})
        assert _label(loan, cards=cards) == "Car & other loans"
        assert _label(card_payment, cards=cards) is None
        assert _label(_row(external_category="LOAN_PAYMENTS", account_type="credit_card")) is None

    def test_one_card_payment_matches_one_row_and_only_within_five_days(self) -> None:
        first, second = (_row("900.00", external_category="LOAN_PAYMENTS") for _ in range(2))
        far = _row("900.00", day=_after(-20), external_category="LOAN_PAYMENTS")
        arrivals = [CardPaymentArrival(transaction_date=_after(1), amount=Decimal("900.00"))]
        assert len(expense_rules.card_payment_ids([first, second, far], arrivals)) == 1
        assert expense_rules.card_payment_ids([far], arrivals) == frozenset()

    def test_interest_on_a_loan_account_and_own_moves_are_not_spending(self) -> None:
        assert _label(_row(account_type="mortgage")) is None
        assert _label(_row(account_type="loan", external_category="LOAN_PAYMENTS")) is None
        assert _label(_row(transaction_type="transfer")) is None


class TestMoneySent:
    def test_money_sent_to_yourself_is_not_spending(self) -> None:
        assert _label(_row(external_category="TRANSFER_OUT", description="Jason  KWON (Sent)")) is None
        assert _label(_row(external_category="TRANSFER_OUT", vendor="Wise to Jason Kwon")) is None

    def test_money_sent_to_someone_else_is(self) -> None:
        assert _label(_row(external_category="TRANSFER_OUT", description="Zelle to Maria Lopez")) == "Money sent to people"
        jason_only = {HOLDER: "Jason"}
        assert _label(_row(external_category="TRANSFER_OUT", description="Jason's Deli"), holders=jason_only) == "Money sent to people"
        assert _label(_row(external_category="TRANSFER_OUT", description="Jason Kwon"), holders={}) == "Money sent to people"


class TestHeadings:
    def test_your_category_then_mbks_then_the_banks(self) -> None:
        assert expense_rules.category_label(_row(spending_category_name="Kids", category="meals", external_category="TRAVEL")) == "Kids"
        assert expense_rules.category_label(_row(category="meals", external_category="TRAVEL")) == "Food & dining"
        assert expense_rules.category_label(_row(external_category="GENERAL_SERVICES")) == "Services"
        assert expense_rules.category_label(_row(category="uncategorized", external_category="INCOME")) == "Other"
        assert expense_rules.category_label(_row(category="mortgage_interest")) == "Mortgage"


class TestMonths:
    def test_full_months_end_last_month_and_cross_the_year(self) -> None:
        assert monthly_expense_breakdown.full_months(3, _dt.date(2026, 2, 1)) == [
            _dt.date(2025, 11, 1), _dt.date(2025, 12, 1), _dt.date(2026, 1, 1),
        ]
        months = monthly_expense_breakdown.full_months(6, _dt.date(2026, 11, 24))
        assert (months[0], months[-1]) == (_dt.date(2026, 5, 1), _dt.date(2026, 10, 1))

    def test_breakdown_sorts_largest_first_and_shares_add_up(self) -> None:
        months = monthly_expense_breakdown.full_months(2, _dt.date(2026, 11, 2))
        rows, categories, total = monthly_expense_breakdown.build_breakdown(months, [
            (_dt.date(2026, 9, 3), "Food", Decimal("10.00")),
            (_dt.date(2026, 10, 3), "Rent", Decimal("30.01")),
            (_dt.date(2026, 11, 1), "Rent", Decimal("999")),
        ])
        assert [(r.month, r.total_cents) for r in rows] == [("2026-09", 10_00), ("2026-10", 30_01)]
        assert total == 40_01
        assert [(c.label, c.average_cents, c.share_percent) for c in categories] == [
            ("Rent", 15_01, 75.0), ("Food", 5_00, 25.0),
        ]

    def test_nothing_spent_is_zero_not_an_error(self) -> None:
        months = monthly_expense_breakdown.full_months(3, DAY)
        rows, categories, total = monthly_expense_breakdown.build_breakdown(months, [])
        assert (total, categories, [r.total_cents for r in rows]) == (0, [], [0, 0, 0])
        assert monthly_expense_breakdown.average_cents(0, 3) == 0


class TestPayees:
    def test_the_payee_is_the_merchant_or_the_person_a_payment_app_paid(self) -> None:
        assert payee_for(_row(vendor="Constellation Energy", description="CONSTELLATION NEWENERGY")) == "Constellation Energy"
        assert payee_for(_row(vendor="Zelle payment to Silvia", description="Zelle payment to Silvia")) == "Silvia"
        assert payee_for(_row(description="ZELLE TO Maria Lopez")) == "Maria Lopez"
        assert payee_for(_row(description="Zelle to ")) == "Zelle to"
        assert payee_for(_row()) == "Unknown payee"

    def test_a_transaction_shows_its_account_and_only_a_description_that_adds_something(self) -> None:
        shown = to_transaction_response(_row("12.34", vendor="Silvia", description="Zelle payment to Silvia"))
        assert (shown.payee, shown.description, shown.amount_cents) == ("Silvia", "Zelle payment to Silvia", 12_34)
        assert (shown.account_name, shown.account_institution, shown.account_mask) == ("TDECU Checking", "TDECU", "4821")
        assert to_transaction_response(_row(vendor="HEB", description="HEB")).description is None

    def test_a_headings_payments_are_newest_first_and_payees_largest_first(self) -> None:
        counted = [
            CountedExpense(row=_row("10.00", day=_after(-3), vendor="HEB"), label="Groceries"),
            CountedExpense(row=_row("30.00", day=_after(1), vendor="Costco"), label="Groceries"),
            CountedExpense(row=_row("25.00", day=_after(2), vendor="heb"), label="Groceries"),
            CountedExpense(row=_row("99.00", vendor="Shell"), label="Transportation"),
        ]
        transactions = monthly_expense_detail.transactions_for(counted, "Groceries")
        assert [t.payee for t in transactions] == ["heb", "Costco", "HEB"]
        payees = monthly_expense_detail.payee_totals(transactions)
        assert [(p.payee, p.total_cents, p.transaction_count) for p in payees] == [("HEB", 35_00, 2), ("Costco", 30_00, 1)]
        assert monthly_expense_detail.transactions_for(counted, "Nothing") == []
