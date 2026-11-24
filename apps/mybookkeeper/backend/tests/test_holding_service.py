"""Hand-entered holdings against a real (SQLite) database.

Pinned here: a holding's value is quantity × price; the account's balance
becomes its holdings' total after every add, edit and remove, and the net
worth snapshot follows it — the holdings themselves are never a second net
worth line; holdings only go on the person's own, live, hand-kept
investment account; the same ticker in one account is refused but is one
security across two accounts; a name-only holding is matched by name;
renaming a ticker moves the holding and forgets the unheld security; the
account service refuses a typed balance (or a non-investment type) on an
account with holdings; and listing is the person's own holdings with
totals and the split by type.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from decimal import Decimal
from typing import Any
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.integrations.plaid_item import PlaidItem
from app.models.investments.holding import Holding
from app.models.investments.security import Security
from app.models.net_worth.balance_snapshot import BalanceSnapshot
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.schemas.investments.holding_create_request import HoldingCreateRequest
from app.schemas.investments.holding_update_request import HoldingUpdateRequest
from app.services.financial_accounts import financial_account_service
from app.services.investments import holding_service
from app.services.investments.duplicate_holding_error import DuplicateHoldingError
from app.services.investments.holding_not_found_error import HoldingNotFoundError
from app.services.investments.invalid_holding_error import InvalidHoldingError

pytestmark = pytest.mark.asyncio


@contextmanager
def _session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with (
        patch.object(holding_service, "unit_of_work", _uow),
        patch.object(financial_account_service, "unit_of_work", _uow),
    ):
        yield


async def _account(
    db: AsyncSession, org: Organization, user: User,
    *, account_type: str = "brokerage", name: str = "Brokerage", plaid_item_id: uuid.UUID | None = None,
) -> FinancialAccount:
    account = FinancialAccount(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id, name=name,
        account_type=account_type, currency="USD", plaid_item_id=plaid_item_id,
    )
    db.add(account)
    await db.commit()
    return account


def _create(account: FinancialAccount, **overrides: Any) -> HoldingCreateRequest:
    values: dict[str, Any] = {
        "financial_account_id": account.id, "ticker_symbol": "vti", "name": "Vanguard Total Stock",
        "security_type": "etf", "quantity": "10.5", "price": "250.1234", "cost_basis_cents": 200_000,
    }
    values.update(overrides)
    return HoldingCreateRequest.model_validate(values)


async def _add(db: AsyncSession, org: Organization, user: User, payload: HoldingCreateRequest):
    with _session(db):
        return await holding_service.create_holding(user_id=user.id, organization_id=org.id, payload=payload)


async def _rows(db: AsyncSession, model: type) -> list[Any]:
    result = await db.execute(select(model).execution_options(populate_existing=True))
    return list(result.scalars().all())


async def test_adding_a_holding_sets_the_account_balance_to_its_value(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    account = await _account(db, test_org, test_user)
    response = await _add(db, test_org, test_user, _create(account))

    # 10.5 × 250.1234 = 2626.2957 → 262630 cents
    assert response.value_cents == 262_630
    assert (response.ticker_symbol, response.is_manual) == ("VTI", True)
    assert response.gain_loss_cents == 62_630
    assert response.gain_loss_percent == 31.32
    await db.refresh(account)
    assert account.current_balance_cents == 262_630
    assert account.balance_as_of == _dt.date.today()
    snapshots = await _rows(db, BalanceSnapshot)
    assert [(s.financial_account_id, s.balance_cents) for s in snapshots] == [(account.id, 262_630)]


async def test_the_balance_follows_every_edit_and_remove(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    account = await _account(db, test_org, test_user)
    first = await _add(db, test_org, test_user, _create(account, quantity="2", price="100"))
    await _add(db, test_org, test_user, _create(account, ticker_symbol=None, name="Cash", security_type="cash",
                                                quantity="500", price="1", cost_basis_cents=None))
    await db.refresh(account)
    assert account.current_balance_cents == 70_000

    with _session(db):
        edited = await holding_service.update_holding(
            holding_id=first.id, user_id=test_user.id, organization_id=test_org.id,
            payload=HoldingUpdateRequest(price=Decimal("150")),
        )
    assert edited.value_cents == 30_000
    await db.refresh(account)
    assert account.current_balance_cents == 80_000

    with _session(db):
        await holding_service.delete_holding(holding_id=first.id, user_id=test_user.id, organization_id=test_org.id)
    await db.refresh(account)
    assert account.current_balance_cents == 50_000
    assert [s.name for s in await _rows(db, Security)] == ["Cash"]


async def test_a_price_edit_redates_the_price_and_a_quantity_edit_does_not(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    account = await _account(db, test_org, test_user)
    created = await _add(db, test_org, test_user, _create(account))
    [holding] = await _rows(db, Holding)
    holding.institution_price_as_of = _dt.date(2026, 1, 2)
    await db.commit()
    with _session(db):
        response = await holding_service.update_holding(
            holding_id=created.id, user_id=test_user.id, organization_id=test_org.id,
            payload=HoldingUpdateRequest(quantity=Decimal("1")),
        )
    assert response.price_as_of == _dt.date(2026, 1, 2)
    assert response.is_price_stale is True
    with _session(db):
        response = await holding_service.update_holding(
            holding_id=created.id, user_id=test_user.id, organization_id=test_org.id,
            payload=HoldingUpdateRequest(price=Decimal("1")),
        )
    assert (response.price_as_of, response.is_price_stale) == (_dt.date.today(), False)


@pytest.mark.parametrize("account_type", ["checking", "credit_card", "mortgage"])
async def test_only_investment_accounts_take_holdings(
    db: AsyncSession, test_user: User, test_org: Organization, account_type: str,
) -> None:
    account = await _account(db, test_org, test_user, account_type=account_type)
    with pytest.raises(InvalidHoldingError):
        await _add(db, test_org, test_user, _create(account))


async def test_a_bank_synced_account_takes_no_hand_entered_holding(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    item = PlaidItem(
        id=uuid.uuid4(), organization_id=test_org.id, user_id=test_user.id, plaid_item_id="item-1",
    )
    item.access_token = "access-1"
    db.add(item)
    await db.commit()
    account = await _account(db, test_org, test_user, plaid_item_id=item.id)
    with pytest.raises(InvalidHoldingError):
        await _add(db, test_org, test_user, _create(account))


async def test_someone_elses_account_is_not_found(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    account = await _account(db, test_org, test_user)
    with _session(db), pytest.raises(HoldingNotFoundError):
        await holding_service.create_holding(
            user_id=uuid.uuid4(), organization_id=test_org.id, payload=_create(account),
        )
    created = await _add(db, test_org, test_user, _create(account))
    with _session(db), pytest.raises(HoldingNotFoundError):
        await holding_service.delete_holding(
            holding_id=created.id, user_id=test_user.id, organization_id=uuid.uuid4(),
        )


async def test_the_same_ticker_twice_in_one_account_is_refused(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    account = await _account(db, test_org, test_user)
    await _add(db, test_org, test_user, _create(account))
    with pytest.raises(DuplicateHoldingError):
        await _add(db, test_org, test_user, _create(account, ticker_symbol="VTI", quantity="1"))


async def test_the_same_ticker_in_two_accounts_is_one_security(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    ira = await _account(db, test_org, test_user, account_type="retirement", name="IRA")
    taxable = await _account(db, test_org, test_user)
    await _add(db, test_org, test_user, _create(ira))
    await _add(db, test_org, test_user, _create(taxable))
    assert len(await _rows(db, Security)) == 1
    assert len(await _rows(db, Holding)) == 2


async def test_name_only_holdings_are_matched_by_name_and_differ_by_name(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    account = await _account(db, test_org, test_user)
    await _add(db, test_org, test_user, _create(account, ticker_symbol=None, name="Target Date 2050"))
    await _add(db, test_org, test_user, _create(account, ticker_symbol=None, name="Stable Value"))
    with pytest.raises(DuplicateHoldingError):
        await _add(db, test_org, test_user, _create(account, ticker_symbol=None, name="Target Date 2050"))
    assert len(await _rows(db, Security)) == 2


async def test_a_ticker_and_a_name_only_holding_with_the_same_name_are_different(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    account = await _account(db, test_org, test_user)
    await _add(db, test_org, test_user, _create(account, ticker_symbol="FXAIX", name="Index"))
    await _add(db, test_org, test_user, _create(account, ticker_symbol=None, name="Index"))
    assert len(await _rows(db, Holding)) == 2


async def test_another_person_with_the_same_ticker_gets_their_own_security(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    other = User(
        id=uuid.uuid4(), email=f"other-{uuid.uuid4()}@example.com", hashed_password="x",
        name="Other", is_active=True, is_verified=True,
    )
    db.add(other)
    await db.commit()
    mine = await _account(db, test_org, test_user)
    theirs = await _account(db, test_org, other)
    await _add(db, test_org, test_user, _create(mine))
    await _add(db, test_org, other, _create(theirs))
    assert sorted(s.user_id for s in await _rows(db, Security)) == sorted([test_user.id, other.id])
    with _session(db):
        listing = await holding_service.list_holdings(
            user_id=test_user.id, organization_id=test_org.id, financial_account_id=None,
        )
    assert [h.financial_account_id for h in listing.holdings] == [mine.id]


async def test_a_ticker_edit_moves_the_holding_and_forgets_the_old_security(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    account = await _account(db, test_org, test_user)
    created = await _add(db, test_org, test_user, _create(account))
    with _session(db):
        response = await holding_service.update_holding(
            holding_id=created.id, user_id=test_user.id, organization_id=test_org.id,
            payload=HoldingUpdateRequest(ticker_symbol="voo"),
        )
    assert response.ticker_symbol == "VOO"
    assert [s.ticker_symbol for s in await _rows(db, Security)] == ["VOO"]


async def test_an_edit_onto_a_ticker_the_account_already_holds_is_refused(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    account = await _account(db, test_org, test_user)
    await _add(db, test_org, test_user, _create(account))
    other = await _add(db, test_org, test_user, _create(account, ticker_symbol="VOO"))
    with _session(db), pytest.raises(DuplicateHoldingError):
        await holding_service.update_holding(
            holding_id=other.id, user_id=test_user.id, organization_id=test_org.id,
            payload=HoldingUpdateRequest(ticker_symbol="VTI"),
        )


async def test_clearing_both_ticker_and_name_is_refused(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    account = await _account(db, test_org, test_user)
    created = await _add(db, test_org, test_user, _create(account))
    with _session(db), pytest.raises(InvalidHoldingError):
        await holding_service.update_holding(
            holding_id=created.id, user_id=test_user.id, organization_id=test_org.id,
            payload=HoldingUpdateRequest.model_validate({"ticker_symbol": None, "name": None}),
        )


async def test_a_typed_balance_is_refused_on_an_account_with_holdings(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    account = await _account(db, test_org, test_user)
    await _add(db, test_org, test_user, _create(account, quantity="1", price="10"))
    await db.refresh(account)
    with _session(db), pytest.raises(financial_account_service.InvalidFinancialAccountError):
        await financial_account_service.update_account(
            account_id=account.id, user_id=test_user.id, organization_id=test_org.id,
            fields={"current_balance_cents": 5, "balance_as_of": _dt.date.today()},
        )
    with _session(db), pytest.raises(financial_account_service.InvalidFinancialAccountError):
        await financial_account_service.update_account(
            account_id=account.id, user_id=test_user.id, organization_id=test_org.id,
            fields={"account_type": "checking"},
        )
    with _session(db):
        renamed = await financial_account_service.update_account(
            account_id=account.id, user_id=test_user.id, organization_id=test_org.id,
            fields={"name": "Taxable", "current_balance_cents": 1_000, "balance_as_of": account.balance_as_of},
        )
    assert (renamed.name, renamed.current_balance_cents) == ("Taxable", 1_000)


async def test_listing_totals_and_splits_by_type(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    ira = await _account(db, test_org, test_user, account_type="retirement", name="IRA")
    taxable = await _account(db, test_org, test_user)
    await _add(db, test_org, test_user, _create(ira, quantity="3", price="100", cost_basis_cents=20_000))
    await _add(db, test_org, test_user, _create(taxable, ticker_symbol="BND", security_type="fixed_income",
                                                quantity="1", price="100", cost_basis_cents=None))
    with _session(db):
        everything = await holding_service.list_holdings(
            user_id=test_user.id, organization_id=test_org.id, financial_account_id=None,
        )
        just_ira = await holding_service.list_holdings(
            user_id=test_user.id, organization_id=test_org.id, financial_account_id=ira.id,
        )
    assert [h.ticker_symbol for h in everything.holdings] == ["VTI", "BND"]
    assert everything.totals.value_cents == 40_000
    assert everything.totals.cost_basis_cents == 20_000
    assert (everything.totals.gain_loss_cents, everything.totals.gain_loss_percent) == (10_000, 50.0)
    assert [(a.security_type, a.percent) for a in everything.allocation] == [("etf", 75.0), ("fixed_income", 25.0)]
    assert [h.account_name for h in just_ira.holdings] == ["IRA"]
    with _session(db), pytest.raises(HoldingNotFoundError):
        await holding_service.list_holdings(
            user_id=test_user.id, organization_id=test_org.id, financial_account_id=uuid.uuid4(),
        )


async def test_a_deleted_account_hides_its_holdings(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    account = await _account(db, test_org, test_user)
    await _add(db, test_org, test_user, _create(account))
    with _session(db):
        await financial_account_service.delete_account(
            account_id=account.id, user_id=test_user.id, organization_id=test_org.id,
        )
        listing = await holding_service.list_holdings(
            user_id=test_user.id, organization_id=test_org.id, financial_account_id=None,
        )
    assert listing.holdings == []
    assert len(await _rows(db, Holding)) == 1
