"""The pure parts of financial accounts: classification, field rules, CSV dedupe keys."""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest

from app.core.financial_account_enums import (
    ACCOUNT_TYPES,
    ASSET_ACCOUNT_TYPES,
    LIABILITY_ACCOUNT_TYPES,
)
from app.mappers.financial_account_mapper import classification_for, totals_for
from app.models.financial_accounts.financial_account import FinancialAccount
from app.schemas.financial_accounts.financial_account_state_rules import validate_account_state
from app.services.transactions.bank_csv_account_scope import dedupe_keys, scoped_external_id


def test_every_type_is_exactly_one_of_asset_or_liability() -> None:
    assert ASSET_ACCOUNT_TYPES | LIABILITY_ACCOUNT_TYPES == frozenset(ACCOUNT_TYPES)
    assert not ASSET_ACCOUNT_TYPES & LIABILITY_ACCOUNT_TYPES


@pytest.mark.parametrize(
    ("account_type", "expected"),
    [("checking", "asset"), ("brokerage", "asset"), ("other_asset", "asset"),
     ("credit_card", "liability"), ("mortgage", "liability"), ("other_liability", "liability")],
)
def test_classification(account_type: str, expected: str) -> None:
    assert classification_for(account_type) == expected


def _account(account_type: str, cents: int | None, *, closed: bool = False) -> FinancialAccount:
    return FinancialAccount(
        id=uuid.uuid4(), organization_id=uuid.uuid4(), user_id=uuid.uuid4(),
        name="x", account_type=account_type, currency="USD",
        current_balance_cents=cents,
        balance_as_of=None if cents is None else _dt.date(2026, 11, 1),
        closed_on=_dt.date(2026, 1, 1) if closed else None,
    )


def test_a_negative_asset_balance_lowers_the_total() -> None:
    [usd] = totals_for([_account("checking", -5_000), _account("savings", 20_000)])
    assert usd.assets_cents == 15_000


def test_no_accounts_means_no_totals() -> None:
    assert totals_for([]) == []
    assert totals_for([_account("checking", None), _account("loan", 100, closed=True)]) == []


def test_state_rules() -> None:
    validate_account_state(
        account_type="mortgage", current_balance_cents=None, balance_as_of=None,
        mortgage_id=uuid.uuid4(),
    )
    with pytest.raises(ValueError, match="balance"):
        validate_account_state(
            account_type="checking", current_balance_cents=100, balance_as_of=None, mortgage_id=None,
        )
    with pytest.raises(ValueError, match="mortgage"):
        validate_account_state(
            account_type="loan", current_balance_cents=None, balance_as_of=None,
            mortgage_id=uuid.uuid4(),
        )


def test_keys_with_and_without_an_account() -> None:
    account_id = uuid.uuid4()
    assert dedupe_keys(None, "2026-08-01_12.00_abc") == ("2026-08-01_12.00_abc",)
    assert dedupe_keys(account_id, "2026-08-01_12.00_abc") == (
        f"{account_id}:2026-08-01_12.00_abc",
        "2026-08-01_12.00_abc",
    )
    assert scoped_external_id(account_id, "k") == f"{account_id}:k"
