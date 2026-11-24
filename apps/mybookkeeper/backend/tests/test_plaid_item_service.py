"""Connecting, listing, reconnecting and disconnecting banks against a real
(SQLite) database, Plaid mocked at the client seam.

Pinned here: connecting stores the token encrypted and adds or links the
chosen accounts; an account Plaid didn't return, an account already synced or
an item already saved is refused *and* the fresh item is removed at Plaid
again; disconnecting revokes at Plaid, unlinks the accounts and keeps every
transaction; a Plaid refusal other than "already gone" keeps the connection;
account deletion revokes every connection after the commit.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import ExitStack, asynccontextmanager, contextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import SecretStr
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.integrations.plaid_item import PlaidItem
from app.models.organization.organization import Organization
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.schemas.plaid.plaid_account_selection import PlaidAccountSelection
from app.schemas.plaid.plaid_item_create_request import PlaidItemCreateRequest
from app.schemas.plaid.wire.plaid_wire_account import PlaidWireAccount
from app.schemas.plaid.wire.plaid_wire_balances import PlaidWireBalances
from app.schemas.plaid.wire.plaid_wire_exchange_response import PlaidWireExchangeResponse
from app.services.plaid import plaid_item_service as svc
from app.services.plaid.invalid_plaid_connection_error import InvalidPlaidConnectionError
from app.services.plaid.plaid_api_error import PlaidApiError
from app.services.plaid.plaid_item_not_found_error import PlaidItemNotFoundError
from app.services.user import account_deletion_service

pytestmark = pytest.mark.asyncio

_CLIENT = "app.services.plaid.plaid_item_service.plaid_client"


@contextmanager
def _session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with patch.object(svc, "unit_of_work", _uow):
        yield


def _wire(account_id: str, *, subtype: str = "checking", mask: str = "4321", current: str = "250.00") -> PlaidWireAccount:
    return PlaidWireAccount(
        account_id=account_id, name=f"Plaid {subtype}", mask=mask, type="depository", subtype=subtype,
        balances=PlaidWireBalances(current=Decimal(current), iso_currency_code="USD"),
    )


@contextmanager
def _plaid(*, item_id: str = "item-1", accounts: list[PlaidWireAccount] | None = None) -> Iterator[dict[str, AsyncMock]]:
    mocks = {
        "exchange_public_token": AsyncMock(return_value=PlaidWireExchangeResponse(
            access_token=SecretStr("access-sandbox-1"), item_id=item_id,
        )),
        "get_accounts": AsyncMock(return_value=accounts if accounts is not None else [_wire("acc-1")]),
        "remove_item": AsyncMock(return_value=None),
    }
    with ExitStack() as stack:
        for name, mock in mocks.items():
            stack.enter_context(patch(f"{_CLIENT}.{name}", mock))
        yield mocks


def _request(*selections: PlaidAccountSelection) -> PlaidItemCreateRequest:
    return PlaidItemCreateRequest(
        public_token="public-sandbox-1", institution_id="ins_3", institution_name="Chase",
        accounts=list(selections) or [PlaidAccountSelection(plaid_account_id="acc-1")],
    )


async def _connect(db: AsyncSession, org: Organization, user: User, request: PlaidItemCreateRequest):
    with _session(db):
        return await svc.connect(user_id=user.id, organization_id=org.id, payload=request)


async def _accounts(db: AsyncSession, org: Organization) -> list[FinancialAccount]:
    result = await db.execute(
        select(FinancialAccount)
        .where(FinancialAccount.organization_id == org.id)
        .execution_options(populate_existing=True),
    )
    return list(result.scalars().all())


async def _items(db: AsyncSession) -> list[PlaidItem]:
    result = await db.execute(select(PlaidItem).execution_options(populate_existing=True))
    return list(result.scalars().all())


class TestConnect:
    async def test_a_new_account_is_added_and_the_token_stored_encrypted(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        with _plaid():
            response = await _connect(db, test_org, test_user, _request())

        assert (response.institution_name, response.status, response.account_count) == ("Chase", "active", 1)
        (item,) = await _items(db)
        assert item.access_token == "access-sandbox-1"
        raw = (await db.execute(text("SELECT access_token_encrypted FROM plaid_items"))).scalar_one()
        assert "access-sandbox-1" not in raw
        (account,) = await _accounts(db, test_org)
        assert (account.plaid_item_id, account.plaid_account_id) == (item.id, "acc-1")
        assert (account.account_type, account.mask, account.current_balance_cents) == ("checking", "4321", 25000)
        assert account.institution_name == "Chase"

    async def test_an_existing_account_is_linked_not_duplicated(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        existing = FinancialAccount(
            id=uuid.uuid4(), organization_id=test_org.id, user_id=test_user.id,
            name="My checking", account_type="checking",
        )
        db.add(existing)
        await db.commit()

        with _plaid():
            await _connect(db, test_org, test_user, _request(PlaidAccountSelection(
                plaid_account_id="acc-1", financial_account_id=existing.id,
                default_transaction_scope="rental",
            )))

        (account,) = await _accounts(db, test_org)
        assert account.id == existing.id
        assert account.name == "My checking"
        assert (account.plaid_account_id, account.default_transaction_scope) == ("acc-1", "rental")
        assert account.current_balance_cents == 25000

    async def test_an_account_plaid_did_not_return_is_refused_and_the_item_removed(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        with _plaid() as plaid, pytest.raises(InvalidPlaidConnectionError):
            await _connect(db, test_org, test_user, _request(PlaidAccountSelection(plaid_account_id="acc-forged")))
        plaid["remove_item"].assert_awaited_once_with("access-sandbox-1")
        assert await _items(db) == []

    async def test_an_account_already_synced_is_refused_and_nothing_is_saved(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        with _plaid(item_id="item-old"):
            await _connect(db, test_org, test_user, _request())
        (synced,) = await _accounts(db, test_org)

        with _plaid(item_id="item-new") as plaid, pytest.raises(InvalidPlaidConnectionError):
            await _connect(db, test_org, test_user, _request(PlaidAccountSelection(
                plaid_account_id="acc-1", financial_account_id=synced.id,
            )))
        plaid["remove_item"].assert_awaited_once()
        await db.rollback()
        assert [i.plaid_item_id for i in await _items(db)] == ["item-old"]

    async def test_someone_elses_account_cannot_be_linked(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        other = FinancialAccount(
            id=uuid.uuid4(), organization_id=test_org.id, user_id=uuid.uuid4(),
            name="Teammate checking", account_type="checking",
        )
        db.add(other)
        await db.commit()
        with _plaid(), pytest.raises(InvalidPlaidConnectionError, match="not found"):
            await _connect(db, test_org, test_user, _request(PlaidAccountSelection(
                plaid_account_id="acc-1", financial_account_id=other.id,
            )))


class TestListAndDisconnect:
    async def test_list_counts_each_connections_accounts(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        with _plaid(accounts=[_wire("acc-1"), _wire("acc-2", subtype="savings", mask="9999")]):
            await _connect(db, test_org, test_user, _request(
                PlaidAccountSelection(plaid_account_id="acc-1"),
                PlaidAccountSelection(plaid_account_id="acc-2"),
            ))
        with _session(db):
            items = await svc.list_items(user_id=test_user.id, organization_id=test_org.id)
            others = await svc.list_items(user_id=uuid.uuid4(), organization_id=test_org.id)
        assert [i.account_count for i in items] == [2]
        assert others == []

    async def test_disconnect_revokes_unlinks_and_keeps_every_transaction(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        with _plaid():
            response = await _connect(db, test_org, test_user, _request())
        (account,) = await _accounts(db, test_org)
        db.add(Transaction(
            organization_id=test_org.id, user_id=test_user.id, account_id=account.id,
            transaction_date=_dt.date(2026, 11, 2), tax_year=2026, amount=Decimal("9.99"),
            transaction_type="expense", category="other_expense", status="approved",
            external_source="plaid", external_id="t-1", transaction_scope="personal",
        ))
        await db.commit()

        with _plaid() as plaid, _session(db):
            await svc.disconnect(item_id=response.id, user_id=test_user.id, organization_id=test_org.id)

        plaid["remove_item"].assert_awaited_once_with("access-sandbox-1")
        assert await _items(db) == []
        (account,) = await _accounts(db, test_org)
        assert (account.plaid_item_id, account.plaid_account_id) == (None, None)
        count = (await db.execute(select(Transaction.id).where(Transaction.account_id == account.id))).all()
        assert len(count) == 1

    async def test_an_item_plaid_already_forgot_still_disconnects(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        with _plaid():
            response = await _connect(db, test_org, test_user, _request())
        gone = PlaidApiError(
            endpoint="/item/remove", status_code=400, error_type="ITEM_ERROR",
            error_code="ITEM_NOT_FOUND", request_id="r",
        )
        with _plaid() as plaid, _session(db):
            plaid["remove_item"].side_effect = gone
            await svc.disconnect(item_id=response.id, user_id=test_user.id, organization_id=test_org.id)
        assert await _items(db) == []

    async def test_a_plaid_outage_keeps_the_connection(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        with _plaid():
            response = await _connect(db, test_org, test_user, _request())

        @asynccontextmanager
        async def _uow_rolling_back():
            try:
                yield db
            except Exception:
                await db.rollback()
                raise

        outage = PlaidApiError(
            endpoint="/item/remove", status_code=500, error_type="API_ERROR",
            error_code="INTERNAL_SERVER_ERROR", request_id="r",
        )
        with _plaid() as plaid, patch.object(svc, "unit_of_work", _uow_rolling_back):
            plaid["remove_item"].side_effect = outage
            with pytest.raises(PlaidApiError):
                await svc.disconnect(item_id=response.id, user_id=test_user.id, organization_id=test_org.id)
        assert len(await _items(db)) == 1

    async def test_someone_elses_connection_cannot_be_disconnected(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        with _plaid():
            response = await _connect(db, test_org, test_user, _request())
        with _plaid() as plaid, _session(db), pytest.raises(PlaidItemNotFoundError):
            await svc.disconnect(item_id=response.id, user_id=uuid.uuid4(), organization_id=test_org.id)
        plaid["remove_item"].assert_not_awaited()


class TestAccountDeletion:
    async def test_deleting_the_account_revokes_every_connection_after_commit(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        with _plaid():
            await _connect(db, test_org, test_user, _request())

        tokens = await svc.list_access_tokens_for_user(db, test_user.id)
        assert tokens == ["access-sandbox-1"]

        after = account_deletion_service._after_deletion([], tokens)
        with _plaid() as plaid, patch.object(account_deletion_service, "remove_stored_files") as files:
            await after()
        files.assert_called_once_with([])
        plaid["remove_item"].assert_awaited_once_with("access-sandbox-1")

    async def test_one_revoke_failing_does_not_stop_the_rest(self) -> None:
        outage = PlaidApiError(
            endpoint="/item/remove", status_code=500, error_type="API_ERROR",
            error_code="INTERNAL_SERVER_ERROR", request_id="r",
        )
        with _plaid() as plaid:
            plaid["remove_item"].side_effect = [outage, None]
            await svc.revoke_access_tokens(["access-a", "access-b"])
        assert plaid["remove_item"].await_count == 2
