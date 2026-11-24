"""Plaid investment holdings sync against a real (SQLite) database, Plaid
mocked at the client seam (``plaid_client.get_holdings``).

Pinned here: holdings and their securities land with values in cents; a
second sync updates in place, drops a sold position and forgets a security
nothing holds; each refusal code Plaid documents for holdings is recorded on
``investments_status`` with its code and never touches the transactions
status; an item with no investment account is never asked (asking would add
the billed product); one person's securities are theirs even when the same
Plaid security is held by someone else; and a holdings failure never fails
the transactions sync that ran before it.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.integrations.plaid_item import PlaidItem
from app.models.investments.holding import Holding
from app.models.investments.security import Security
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.schemas.plaid.plaid_sync_batch import PlaidSyncBatch
from app.schemas.plaid.wire.plaid_wire_account import PlaidWireAccount
from app.schemas.plaid.wire.plaid_wire_balances import PlaidWireBalances
from app.schemas.plaid.wire.plaid_wire_holding import PlaidWireHolding
from app.schemas.plaid.wire.plaid_wire_holdings_response import PlaidWireHoldingsResponse
from app.schemas.plaid.wire.plaid_wire_security import PlaidWireSecurity
from app.services.plaid import plaid_holdings_sync_service as svc
from app.services.plaid import plaid_sync_service
from app.services.plaid.plaid_api_error import PlaidApiError

pytestmark = pytest.mark.asyncio

_HOLDINGS = "app.services.plaid.plaid_holdings_sync_service.plaid_client.get_holdings"
_TRANSACTIONS = "app.services.plaid.plaid_sync_service.plaid_client.sync_transactions"
_PRICED = _dt.date(2026, 11, 20)


@contextmanager
def _session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with patch.object(svc, "unit_of_work", _uow), patch.object(plaid_sync_service, "unit_of_work", _uow):
        yield


async def _item(db: AsyncSession, org: Organization, user: User) -> PlaidItem:
    item = PlaidItem(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id,
        plaid_item_id=f"item-{uuid.uuid4()}", institution_name="Fidelity",
    )
    item.access_token = "access-1"
    db.add(item)
    await db.commit()
    return item


async def _account(
    db: AsyncSession, org: Organization, user: User, item: PlaidItem,
    *, plaid_account_id: str = "inv-1", account_type: str = "brokerage",
) -> FinancialAccount:
    account = FinancialAccount(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id, name="Brokerage",
        account_type=account_type, currency="USD", plaid_item_id=item.id,
        plaid_account_id=plaid_account_id, current_balance_cents=100_000, balance_as_of=_PRICED,
    )
    db.add(account)
    await db.commit()
    return account


def _wire_account(account_id: str = "inv-1") -> PlaidWireAccount:
    return PlaidWireAccount(
        account_id=account_id, name="Brokerage", type="investment", subtype="brokerage",
        balances=PlaidWireBalances(current=Decimal("1000.00"), iso_currency_code="USD"),
    )


def _security(security_id: str, ticker: str | None, **fields: Any) -> PlaidWireSecurity:
    return PlaidWireSecurity(
        security_id=security_id, ticker_symbol=ticker, name=fields.pop("name", f"{ticker} fund"),
        type=fields.pop("type", "etf"), close_price=Decimal("100"), close_price_as_of=_PRICED,
        iso_currency_code="USD", **fields,
    )


def _holding(security_id: str, *, quantity: str, value: str, cost: str | None = None) -> PlaidWireHolding:
    return PlaidWireHolding(
        account_id="inv-1", security_id=security_id, quantity=Decimal(quantity),
        institution_price=Decimal("100"), institution_price_as_of=_PRICED,
        institution_value=Decimal(value), cost_basis=None if cost is None else Decimal(cost),
        iso_currency_code="USD",
    )


def _response(holdings: list[PlaidWireHolding], securities: list[PlaidWireSecurity]) -> PlaidWireHoldingsResponse:
    return PlaidWireHoldingsResponse(accounts=[_wire_account()], holdings=holdings, securities=securities)


def _refusal(error_code: str, error_type: str = "ITEM_ERROR") -> PlaidApiError:
    return PlaidApiError(
        endpoint="/investments/holdings/get", status_code=400, error_type=error_type,
        error_code=error_code, request_id="req-1",
    )


async def _rows(db: AsyncSession, model: type) -> list[Any]:
    result = await db.execute(select(model).execution_options(populate_existing=True))
    return list(result.scalars().all())


async def test_holdings_and_their_securities_are_stored(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _item(db, test_org, test_user)
    account = await _account(db, test_org, test_user, item)
    response = _response(
        [_holding("sec-vti", quantity="10.5", value="1050.555", cost="900.00")],
        [_security("sec-vti", "VTI", type="mutual fund", cusip="922908769")],
    )
    with _session(db), patch(_HOLDINGS, AsyncMock(return_value=response)):
        status = await svc.sync_holdings(item.id)

    assert status == "active"
    [holding] = await _rows(db, Holding)
    [security] = await _rows(db, Security)
    assert (holding.financial_account_id, holding.security_id) == (account.id, security.id)
    assert (holding.quantity, holding.institution_value_cents, holding.cost_basis_cents) == (
        Decimal("10.5"), 105056, 90000,
    )
    assert (security.ticker_symbol, security.security_type, security.cusip) == ("VTI", "mutual_fund", "922908769")
    assert (security.user_id, security.organization_id) == (test_user.id, test_org.id)
    await db.refresh(item)
    assert item.holdings_synced_at is not None
    assert item.investments_error_code is None


async def test_a_resync_updates_in_place_and_drops_what_was_sold(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _item(db, test_org, test_user)
    await _account(db, test_org, test_user, item)
    first = _response(
        [_holding("sec-a", quantity="1", value="100"), _holding("sec-b", quantity="2", value="200")],
        [_security("sec-a", "AAA"), _security("sec-b", "BBB")],
    )
    second = _response([_holding("sec-a", quantity="3", value="300")], [_security("sec-a", "AAA")])
    with _session(db):
        with patch(_HOLDINGS, AsyncMock(return_value=first)):
            await svc.sync_holdings(item.id)
        [kept_before] = [h for h in await _rows(db, Holding) if h.quantity == Decimal("1")]
        with patch(_HOLDINGS, AsyncMock(return_value=second)):
            await svc.sync_holdings(item.id)

    [holding] = await _rows(db, Holding)
    assert holding.id == kept_before.id
    assert holding.quantity == Decimal("3")
    assert [s.ticker_symbol for s in await _rows(db, Security)] == ["AAA"]


async def test_the_balance_stays_the_one_plaid_reports_for_the_account(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _item(db, test_org, test_user)
    account = await _account(db, test_org, test_user, item)
    response = _response([_holding("sec-a", quantity="1", value="5")], [_security("sec-a", "AAA")])
    with _session(db), patch(_HOLDINGS, AsyncMock(return_value=response)):
        await svc.sync_holdings(item.id)
    await db.refresh(account)
    assert account.current_balance_cents == 100_000


@pytest.mark.parametrize(("error_code", "error_type", "expected"), [
    ("PRODUCTS_NOT_SUPPORTED", "ITEM_ERROR", "unavailable"),
    ("NO_INVESTMENT_ACCOUNTS", "ITEM_ERROR", "unavailable"),
    ("INVALID_PRODUCT", "INVALID_INPUT", "unavailable"),
    ("PRODUCT_NOT_READY", "ITEM_ERROR", "not_ready"),
    ("ADDITIONAL_CONSENT_REQUIRED", "INVALID_INPUT", "consent_required"),
    ("INTERNAL_SERVER_ERROR", "API_ERROR", "error"),
])
async def test_a_refusal_is_recorded_apart_from_the_connection_status(
    db: AsyncSession, test_user: User, test_org: Organization,
    error_code: str, error_type: str, expected: str,
) -> None:
    item = await _item(db, test_org, test_user)
    await _account(db, test_org, test_user, item)
    with _session(db), patch(_HOLDINGS, AsyncMock(side_effect=_refusal(error_code, error_type))):
        status = await svc.sync_holdings(item.id)

    assert status == expected
    await db.refresh(item)
    assert (item.investments_status, item.investments_error_code) == (expected, error_code)
    assert (item.status, item.error_code) == ("active", None)


async def test_an_item_without_an_investment_account_is_never_asked(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _item(db, test_org, test_user)
    await _account(db, test_org, test_user, item, plaid_account_id="chk-1", account_type="checking")
    get_holdings = AsyncMock()
    with _session(db), patch(_HOLDINGS, get_holdings):
        assert await svc.sync_holdings(item.id) is None
    get_holdings.assert_not_awaited()


async def test_the_same_plaid_security_is_a_separate_row_per_person(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    other = User(
        id=uuid.uuid4(), email=f"other-{uuid.uuid4()}@example.com", hashed_password="x",
        name="Other", is_active=True, is_verified=True,
    )
    db.add(other)
    await db.commit()
    mine = await _item(db, test_org, test_user)
    theirs = await _item(db, test_org, other)
    await _account(db, test_org, test_user, mine)
    await _account(db, test_org, other, theirs)
    response = _response([_holding("sec-a", quantity="1", value="100")], [_security("sec-a", "AAA")])
    with _session(db), patch(_HOLDINGS, AsyncMock(return_value=response)):
        await svc.sync_holdings(mine.id)
        await svc.sync_holdings(theirs.id)

    securities = await _rows(db, Security)
    assert sorted(s.user_id for s in securities) == sorted([test_user.id, other.id])
    assert len(await _rows(db, Holding)) == 2


async def test_a_holdings_failure_never_fails_the_transactions_sync(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _item(db, test_org, test_user)
    await _account(db, test_org, test_user, item)
    batch = PlaidSyncBatch(added=[], modified=[], removed=[], accounts=[], next_cursor="c-1")
    with (
        _session(db),
        patch(_TRANSACTIONS, AsyncMock(return_value=batch)),
        patch(_HOLDINGS, AsyncMock(side_effect=RuntimeError("boom"))),
    ):
        result = await plaid_sync_service.sync_item(item.id)

    assert result.status == "active"
    await db.refresh(item)
    assert item.transactions_cursor == "c-1"
    assert item.status == "active"


async def test_a_transactions_sync_then_pulls_holdings(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = await _item(db, test_org, test_user)
    await _account(db, test_org, test_user, item)
    batch = PlaidSyncBatch(added=[], modified=[], removed=[], accounts=[], next_cursor="c-1")
    response = _response([_holding("sec-a", quantity="1", value="100")], [_security("sec-a", "AAA")])
    with (
        _session(db),
        patch(_TRANSACTIONS, AsyncMock(return_value=batch)),
        patch(_HOLDINGS, AsyncMock(return_value=response)),
    ):
        await plaid_sync_service.sync_item(item.id)

    assert len(await _rows(db, Holding)) == 1
