"""What counts toward net worth today — pure, no database.

Pinned: a loan record with a live account linked to it counts once, as the
account (open or closed); an unlinked record counts from its own balance; a
closed account and an inactive property drop out; a property without a value
is listed but never valued from its purchase price; another currency is
listed but kept out of the total.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from app.core.net_worth_constants import (
    GROUP_CASH,
    GROUP_LOANS,
    GROUP_PROPERTY,
    SOURCE_ACCOUNT,
    SOURCE_MORTGAGE,
    SOURCE_PROPERTY,
)
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.mortgage.mortgage import Mortgage
from app.models.properties.property import Property
from app.services.net_worth.net_worth_lines import build_lines, history_sources, is_counted
from app.services.net_worth.snapshot_source_key import SnapshotSourceKey

_DAY = _dt.date(2026, 11, 20)


def _account(**overrides: object) -> FinancialAccount:
    values: dict[str, object] = {
        "id": uuid.uuid4(), "name": "Chase Checking", "account_type": "checking",
        "currency": "USD", "current_balance_cents": 100_00, "balance_as_of": _DAY,
        "closed_on": None, "mortgage_id": None, "institution_name": "Chase",
    }
    values.update(overrides)
    return FinancialAccount(**values)


def _mortgage(**overrides: object) -> Mortgage:
    values: dict[str, object] = {
        "id": uuid.uuid4(), "property_id": uuid.uuid4(), "lender": "Rocket",
        "current_balance_cents": 250_000_00, "statement_date": _DAY,
    }
    values.update(overrides)
    return Mortgage(**values)


def _property(**overrides: object) -> Property:
    values: dict[str, object] = {
        "id": uuid.uuid4(), "name": "6734 Peerless", "address": "6734 Peerless St",
        "is_active": True, "estimated_value_cents": None, "estimated_value_as_of": None,
        "purchase_price": None,
    }
    values.update(overrides)
    return Property(**values)


class TestDoubleCounting:
    def test_a_loan_record_linked_to_an_account_counts_only_as_the_account(self) -> None:
        loan = _mortgage()
        account = _account(account_type="mortgage", mortgage_id=loan.id, current_balance_cents=249_000_00)
        lines = build_lines(accounts=[account], mortgages=[loan], properties=[])
        assert [line.source for line in lines] == [SOURCE_ACCOUNT]
        assert lines[0].amount_cents == 249_000_00
        assert lines[0].group == GROUP_LOANS

    def test_a_closed_linked_account_still_claims_its_loan_record(self) -> None:
        loan = _mortgage()
        account = _account(account_type="mortgage", mortgage_id=loan.id, closed_on=_DAY)
        assert build_lines(accounts=[account], mortgages=[loan], properties=[]) == []

    def test_an_unlinked_loan_record_counts_from_its_statement_balance(self) -> None:
        home = _property(name="Elm St")
        loan = _mortgage(property_id=home.id)
        other_loan_account = _account(account_type="mortgage", mortgage_id=uuid.uuid4())
        lines = build_lines(accounts=[other_loan_account], mortgages=[loan], properties=[home])
        mortgage_lines = [line for line in lines if line.source == SOURCE_MORTGAGE]
        assert len(mortgage_lines) == 1
        assert mortgage_lines[0].amount_cents == 250_000_00
        assert mortgage_lines[0].detail == "Elm St"
        assert mortgage_lines[0].as_of == _DAY

    def test_two_loans_on_one_home_with_one_linked_count_once_each(self) -> None:
        home = _property()
        first, second = _mortgage(property_id=home.id), _mortgage(property_id=home.id)
        account = _account(account_type="mortgage", mortgage_id=first.id)
        lines = build_lines(accounts=[account], mortgages=[first, second], properties=[home])
        keys = {(line.source, line.source_id) for line in lines}
        assert (SOURCE_ACCOUNT, account.id) in keys
        assert (SOURCE_MORTGAGE, second.id) in keys
        assert (SOURCE_MORTGAGE, first.id) not in keys


class TestWhatIsListed:
    def test_a_closed_account_is_left_out(self) -> None:
        assert build_lines(accounts=[_account(closed_on=_DAY)], mortgages=[], properties=[]) == []

    def test_an_inactive_property_is_left_out(self) -> None:
        assert build_lines(accounts=[], mortgages=[], properties=[_property(is_active=False)]) == []

    def test_a_property_without_a_value_is_listed_but_never_valued_from_its_price(self) -> None:
        home = _property(purchase_price=Decimal("300000.00"))
        [line] = build_lines(accounts=[], mortgages=[], properties=[home])
        assert line.source == SOURCE_PROPERTY
        assert line.group == GROUP_PROPERTY
        assert line.amount_cents is None
        assert not is_counted(line)

    def test_an_account_in_another_currency_is_listed_not_counted(self) -> None:
        [line] = build_lines(accounts=[_account(currency="EUR")], mortgages=[], properties=[])
        assert line.group == GROUP_CASH
        assert not is_counted(line)

    def test_an_account_without_a_balance_is_listed_not_counted(self) -> None:
        [line] = build_lines(
            accounts=[_account(current_balance_cents=None, balance_as_of=None)], mortgages=[], properties=[],
        )
        assert not is_counted(line)


class TestHistorySources:
    def test_a_linked_loan_record_is_represented_by_its_account(self) -> None:
        loan = _mortgage()
        account = _account(account_type="mortgage", mortgage_id=loan.id)
        lines = build_lines(accounts=[account], mortgages=[loan], properties=[])
        sources = history_sources(accounts=[account], mortgages=[loan], properties=[], today_lines=lines)
        record = sources[SnapshotSourceKey(SOURCE_MORTGAGE, loan.id)]
        assert record.represented_by == SnapshotSourceKey(SOURCE_ACCOUNT, account.id)
        assert record.counted_today is False
        assert sources[SnapshotSourceKey(SOURCE_ACCOUNT, account.id)].counted_today is True

    def test_closed_accounts_and_inactive_properties_are_known_but_not_counted_today(self) -> None:
        closed = _account(closed_on=_DAY)
        sold = _property(is_active=False, estimated_value_cents=1, estimated_value_as_of=_DAY)
        sources = history_sources(accounts=[closed], mortgages=[], properties=[sold], today_lines=[])
        assert sources[SnapshotSourceKey(SOURCE_ACCOUNT, closed.id)].counted_today is False
        assert sources[SnapshotSourceKey(SOURCE_PROPERTY, sold.id)].classification == "asset"
