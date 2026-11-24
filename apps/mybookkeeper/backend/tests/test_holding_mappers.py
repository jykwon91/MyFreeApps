"""The pure holdings mappers.

Pinned here: Plaid's security types map onto ours ("mutual fund" →
mutual_fund, unknown or missing → other); a CUSIP/ISIN of the wrong length
is dropped; a security with neither ticker nor name still gets a name;
amounts become cents half-up; a price as-of never outlives its price; each
holdings refusal code maps to its status; gain/loss is null without a cost
basis and its percent null on a zero cost basis; a missing price falls back
to the security's last close; staleness is past a week; and the allocation
is by type, largest first, in percent of the total.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

import pytest

from app.mappers import holding_mapper, plaid_holding_mapper
from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.investments.holding import Holding
from app.models.investments.security import Security
from app.schemas.plaid.wire.plaid_wire_holding import PlaidWireHolding
from app.schemas.plaid.wire.plaid_wire_security import PlaidWireSecurity

_TODAY = _dt.date(2026, 11, 24)
_ACCOUNT = FinancialAccount(id=uuid.uuid4(), name="Brokerage", account_type="brokerage", plaid_item_id=None)


@pytest.mark.parametrize(("plaid_type", "expected"), [
    ("equity", "equity"), ("mutual fund", "mutual_fund"), ("fixed income", "fixed_income"),
    ("cryptocurrency", "cryptocurrency"), ("Something New", "other"), (None, "other"),
])
def test_security_types_map_onto_ours(plaid_type: str | None, expected: str) -> None:
    assert plaid_holding_mapper.security_type_for(plaid_type) == expected


def test_security_fields_drop_bad_identifiers_and_keep_a_name() -> None:
    fields = plaid_holding_mapper.security_fields(PlaidWireSecurity(
        security_id="s", ticker_symbol=None, name=None, cusip="123", isin="us0378331005",
        close_price=None, close_price_as_of=_TODAY,
    ))
    assert (fields["cusip"], fields["isin"]) == (None, "US0378331005")
    assert fields["name"] == "Unnamed security"
    assert fields["close_price_as_of"] is None
    assert fields["currency"] == "USD"


def test_holding_fields_are_cents_half_up() -> None:
    fields = plaid_holding_mapper.holding_fields(PlaidWireHolding(
        account_id="a", security_id="s", quantity=Decimal("2"), institution_price=None,
        institution_price_as_of=_TODAY, institution_value=Decimal("10.005"), cost_basis=Decimal("8.004"),
    ))
    assert (fields["institution_value_cents"], fields["cost_basis_cents"]) == (1001, 800)
    assert fields["institution_price_as_of"] is None


@pytest.mark.parametrize(("code", "status"), [
    ("ADDITIONAL_CONSENT_REQUIRED", "consent_required"),
    ("PRODUCT_NOT_READY", "not_ready"),
    ("PRODUCTS_NOT_SUPPORTED", "unavailable"),
    ("NO_INVESTMENT_ACCOUNTS", "unavailable"),
    ("INVALID_PRODUCT", "unavailable"),
    ("RATE_LIMIT_EXCEEDED", "error"),
    (None, "error"),
])
def test_refusal_codes_map_to_statuses(code: str | None, status: str) -> None:
    assert plaid_holding_mapper.investments_status_for(code) == status


def _security(**fields: object) -> Security:
    return Security(
        id=uuid.uuid4(), ticker_symbol=fields.pop("ticker_symbol", "VTI"), name="Fund",
        security_type=fields.pop("security_type", "etf"), **fields,
    )


def _holding(security: Security, **fields: object) -> Holding:
    return Holding(
        id=uuid.uuid4(), financial_account_id=_ACCOUNT.id, security_id=security.id, currency="USD", **fields,
    )


def test_gain_loss_needs_a_cost_basis_and_percent_a_positive_one() -> None:
    security = _security()
    unknown = holding_mapper.to_response(
        _holding(security, institution_value_cents=1_000), security=security, account=_ACCOUNT, today=_TODAY,
    )
    free = holding_mapper.to_response(
        _holding(security, institution_value_cents=1_000, cost_basis_cents=0),
        security=security, account=_ACCOUNT, today=_TODAY,
    )
    loss = holding_mapper.to_response(
        _holding(security, institution_value_cents=750, cost_basis_cents=1_000),
        security=security, account=_ACCOUNT, today=_TODAY,
    )
    assert (unknown.gain_loss_cents, unknown.gain_loss_percent) == (None, None)
    assert (free.gain_loss_cents, free.gain_loss_percent) == (1_000, None)
    assert (loss.gain_loss_cents, loss.gain_loss_percent) == (-250, -25.0)


def test_a_missing_price_falls_back_to_the_last_close_and_is_dated_by_it() -> None:
    security = _security(close_price=Decimal("20"), close_price_as_of=_TODAY - _dt.timedelta(days=8))
    line = holding_mapper.to_response(
        _holding(security, quantity=Decimal("3")), security=security, account=_ACCOUNT, today=_TODAY,
    )
    assert (line.price, line.value_cents, line.is_price_stale) == (Decimal("20"), 6_000, True)


@pytest.mark.parametrize(("days", "stale"), [(0, False), (7, False), (8, True)])
def test_a_price_is_stale_past_a_week(days: int, stale: bool) -> None:
    assert holding_mapper.is_stale(_TODAY - _dt.timedelta(days=days), _TODAY) is stale
    assert holding_mapper.is_stale(None, _TODAY) is False


def test_the_list_is_largest_first_with_the_split_by_type() -> None:
    etf = _security()
    bond = _security(ticker_symbol="BND", security_type="fixed_income")
    cash = _security(ticker_symbol=None, security_type="cash")
    holdings = [
        _holding(bond, institution_value_cents=2_500, cost_basis_cents=2_000),
        _holding(etf, institution_value_cents=7_000, cost_basis_cents=8_000),
        _holding(cash, institution_value_cents=500),
    ]
    listing = holding_mapper.to_list_response(
        holdings,
        securities={s.id: s for s in (etf, bond, cash)},
        accounts={_ACCOUNT.id: _ACCOUNT},
        financial_account_id=None,
        today=_TODAY,
    )
    assert [line.value_cents for line in listing.holdings] == [7_000, 2_500, 500]
    assert listing.totals.value_cents == 10_000
    assert listing.totals.cost_basis_cents == 10_000
    assert (listing.totals.gain_loss_cents, listing.totals.gain_loss_percent) == (-500, -5.0)
    assert [(a.security_type, a.percent) for a in listing.allocation] == [
        ("etf", 70.0), ("fixed_income", 25.0), ("cash", 5.0),
    ]


def test_an_empty_list_has_no_percentages() -> None:
    listing = holding_mapper.to_list_response(
        [], securities={}, accounts={}, financial_account_id=None, today=_TODAY,
    )
    assert (listing.holdings, listing.allocation, listing.totals.value_cents) == ([], [], 0)
    assert listing.totals.gain_loss_percent is None
