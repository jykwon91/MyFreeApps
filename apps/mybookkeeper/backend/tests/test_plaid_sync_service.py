"""Plaid transaction sync against a real (SQLite) database, Plaid mocked at
the client seam (``plaid_client.sync_transactions``).

Pinned here: added / modified / removed rows land as created / updated /
soft-deleted; the cursor is stored and sent back next time; a repeat id, a
bank-CSV row already on file and a pending row are never added; the second
leg of a transfer between two connected accounts becomes one transfer row;
personal spending gets the obvious category; a bank edit to a row an unfiled
tax return counts marks that return out of date; balances update; and a Plaid
refusal (ITEM_LOGIN_REQUIRED) is stored on the item instead of raised.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.financial_accounts.financial_account import FinancialAccount
from app.models.integrations.plaid_item import PlaidItem
from app.models.organization.organization import Organization
from app.models.tax.tax_return import TaxReturn
from app.models.transactions.spending_category import SpendingCategory
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.schemas.plaid.plaid_sync_batch import PlaidSyncBatch
from app.schemas.plaid.wire.plaid_wire_account import PlaidWireAccount
from app.schemas.plaid.wire.plaid_wire_balances import PlaidWireBalances
from app.schemas.plaid.wire.plaid_wire_category import PlaidWireCategory
from app.schemas.plaid.wire.plaid_wire_transaction import PlaidWireTransaction
from app.services.plaid import plaid_sync_service as svc
from app.services.plaid.plaid_api_error import PlaidApiError
from app.services.plaid.plaid_item_not_found_error import PlaidItemNotFoundError
from app.services.plaid.plaid_login_required_error import PlaidLoginRequiredError

pytestmark = pytest.mark.asyncio

_CLIENT = "app.services.plaid.plaid_sync_service.plaid_client.sync_transactions"
_DAY = _dt.date(2026, 11, 2)


@contextmanager
def _session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with patch.object(svc, "unit_of_work", _uow):
        yield


def _batch(
    *,
    added: list[PlaidWireTransaction] | None = None,
    modified: list[PlaidWireTransaction] | None = None,
    removed: list[str] | None = None,
    accounts: list[PlaidWireAccount] | None = None,
    cursor: str = "cursor-2",
) -> PlaidSyncBatch:
    return PlaidSyncBatch(
        added=added or [], modified=modified or [], removed=removed or [],
        accounts=accounts or [], next_cursor=cursor,
    )


def _txn(
    transaction_id: str,
    *,
    account_id: str = "plaid-checking",
    amount: str = "12.50",
    day: _dt.date = _DAY,
    name: str = "Corner Store",
    pending: bool = False,
    primary: str | None = "GENERAL_MERCHANDISE",
    detailed: str | None = None,
) -> PlaidWireTransaction:
    return PlaidWireTransaction(
        transaction_id=transaction_id, account_id=account_id, amount=Decimal(amount),
        date=day, name=name, pending=pending,
        personal_finance_category=(
            PlaidWireCategory(primary=primary, detailed=detailed) if primary else None
        ),
    )


async def _item(db: AsyncSession, org: Organization, user: User, *, status: str = "active") -> PlaidItem:
    item = PlaidItem(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id,
        plaid_item_id=f"item-{uuid.uuid4()}", institution_name="Chase", status=status,
    )
    item.access_token = "access-sandbox-secret"
    db.add(item)
    await db.commit()
    return item


async def _account(
    db: AsyncSession, org: Organization, user: User, item: PlaidItem,
    *, plaid_account_id: str = "plaid-checking", scope: str = "personal",
    account_type: str = "checking", name: str = "Checking",
) -> FinancialAccount:
    account = FinancialAccount(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id, name=name,
        account_type=account_type, plaid_item_id=item.id, plaid_account_id=plaid_account_id,
        default_transaction_scope=scope,
    )
    db.add(account)
    await db.commit()
    return account


async def _sync(db: AsyncSession, item: PlaidItem, batch: PlaidSyncBatch) -> tuple[object, AsyncMock]:
    client = AsyncMock(return_value=batch)
    with _session(db), patch(_CLIENT, client):
        result = await svc.sync_item(item.id)
    return result, client


async def _rows(db: AsyncSession, org: Organization) -> list[Transaction]:
    result = await db.execute(
        select(Transaction)
        .where(Transaction.organization_id == org.id)
        .order_by(Transaction.created_at)
        .execution_options(populate_existing=True),
    )
    return list(result.scalars().all())


class TestAddedModifiedRemoved:
    async def test_added_rows_are_created_on_the_linked_account(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item = await _item(db, test_org, test_user)
        account = await _account(db, test_org, test_user, item)
        result, _ = await _sync(db, item, _batch(added=[
            _txn("t-out", amount="12.50"),
            _txn("t-in", amount="-900.00", name="Payroll", primary="INCOME"),
        ]))

        assert result.added == 2
        rows = {r.external_id: r for r in await _rows(db, test_org)}
        assert rows["t-out"].transaction_type == "expense"
        assert rows["t-out"].amount == Decimal("12.50")
        assert rows["t-out"].account_id == account.id
        assert rows["t-out"].external_source == "plaid"
        assert rows["t-out"].transaction_scope == "personal"
        assert rows["t-out"].tax_relevant is False
        assert rows["t-in"].transaction_type == "income"
        assert rows["t-in"].amount == Decimal("900.00")

    async def test_modified_updates_bank_fields_but_keeps_the_persons_filing(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item = await _item(db, test_org, test_user)
        await _account(db, test_org, test_user, item)
        await _sync(db, item, _batch(added=[_txn("t-1", amount="10.00")]))
        row = (await _rows(db, test_org))[0]
        row.notes = "lunch with the plumber"
        await db.commit()

        result, _ = await _sync(db, item, _batch(modified=[
            _txn("t-1", amount="14.25", name="Corner Store #2", day=_DAY + _dt.timedelta(days=1)),
        ]))

        assert result.modified == 1
        row = (await _rows(db, test_org))[0]
        assert row.amount == Decimal("14.25")
        assert row.vendor == "Corner Store #2"
        assert row.transaction_date == _DAY + _dt.timedelta(days=1)
        assert row.notes == "lunch with the plumber"

    async def test_removed_rows_are_soft_deleted(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item = await _item(db, test_org, test_user)
        await _account(db, test_org, test_user, item)
        await _sync(db, item, _batch(added=[_txn("t-1")]))

        result, _ = await _sync(db, item, _batch(removed=["t-1", "t-never-stored"]))

        assert result.removed == 1
        row = (await _rows(db, test_org))[0]
        assert row.deleted_at is not None
        assert row.status == "duplicate"

    async def test_a_modified_or_removed_id_never_stored_is_ignored(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item = await _item(db, test_org, test_user)
        await _account(db, test_org, test_user, item)
        result, _ = await _sync(db, item, _batch(modified=[_txn("ghost")], removed=["ghost-2"]))
        assert (result.modified, result.removed) == (0, 0)
        assert await _rows(db, test_org) == []


class TestCursor:
    async def test_the_cursor_is_stored_and_sent_back_next_time(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item = await _item(db, test_org, test_user)
        await _account(db, test_org, test_user, item)

        _, first = await _sync(db, item, _batch(cursor="cursor-A"))
        _, second = await _sync(db, item, _batch(cursor="cursor-B"))

        assert first.await_args.args == ("access-sandbox-secret", None)
        assert second.await_args.args == ("access-sandbox-secret", "cursor-A")
        await db.refresh(item)
        assert item.transactions_cursor == "cursor-B"
        assert item.last_synced_at is not None

    async def test_a_refused_sync_keeps_the_old_cursor(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item = await _item(db, test_org, test_user)
        item.transactions_cursor = "cursor-A"
        await db.commit()
        client = AsyncMock(side_effect=PlaidApiError(
            endpoint="/transactions/sync", status_code=500, error_type="API_ERROR",
            error_code="INTERNAL_SERVER_ERROR", request_id="req-1",
        ))
        with _session(db), patch(_CLIENT, client):
            result = await svc.sync_item(item.id)

        await db.refresh(item)
        assert item.transactions_cursor == "cursor-A"
        # A transient failure records the code but keeps the item active.
        assert result.status == "active"
        assert item.error_code == "INTERNAL_SERVER_ERROR"


class TestDedupe:
    async def test_a_repeat_plaid_id_is_never_added_twice(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item = await _item(db, test_org, test_user)
        await _account(db, test_org, test_user, item)
        await _sync(db, item, _batch(added=[_txn("t-1")]))
        result, _ = await _sync(db, item, _batch(added=[_txn("t-1")]))
        assert result.added == 0
        assert len(await _rows(db, test_org)) == 1

    async def test_a_row_the_person_deleted_stays_deleted(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item = await _item(db, test_org, test_user)
        await _account(db, test_org, test_user, item)
        await _sync(db, item, _batch(added=[_txn("t-1")]))
        await _sync(db, item, _batch(removed=["t-1"]))
        result, _ = await _sync(db, item, _batch(added=[_txn("t-1")]))
        assert result.added == 0
        assert [r.deleted_at is not None for r in await _rows(db, test_org)] == [True]

    async def test_a_bank_csv_row_on_the_same_account_day_and_amount_is_not_duplicated(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item = await _item(db, test_org, test_user)
        account = await _account(db, test_org, test_user, item)
        db.add(Transaction(
            organization_id=test_org.id, user_id=test_user.id, account_id=account.id,
            transaction_date=_DAY, tax_year=_DAY.year, amount=Decimal("12.50"),
            transaction_type="expense", category="other_expense", status="approved",
            external_source="bank_csv", external_id="2026-11-02_12.50_abc",
            transaction_scope="personal",
        ))
        await db.commit()

        result, _ = await _sync(db, item, _batch(added=[
            _txn("t-1", amount="12.50"),
            # A second purchase of the same amount the same day is real.
            _txn("t-2", amount="12.50"),
        ]))

        assert (result.added, result.matched_existing) == (1, 1)
        sources = sorted(r.external_source for r in await _rows(db, test_org))
        assert sources == ["bank_csv", "plaid"]

    async def test_two_same_amount_purchases_from_this_connection_are_both_kept(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item = await _item(db, test_org, test_user)
        await _account(db, test_org, test_user, item)
        await _sync(db, item, _batch(added=[_txn("t-1", amount="5.00")]))
        result, _ = await _sync(db, item, _batch(added=[_txn("t-2", amount="5.00")]))
        assert (result.added, result.matched_existing) == (1, 0)

    async def test_pending_rows_wait_until_they_post(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item = await _item(db, test_org, test_user)
        await _account(db, test_org, test_user, item)
        result, _ = await _sync(db, item, _batch(added=[_txn("t-pending", pending=True)]))
        assert result.added == 0
        assert await _rows(db, test_org) == []

    async def test_rows_for_an_account_not_linked_are_skipped(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item = await _item(db, test_org, test_user)
        await _account(db, test_org, test_user, item)
        result, _ = await _sync(db, item, _batch(added=[_txn("t-1", account_id="plaid-other")]))
        assert result.added == 0


class TestTransfers:
    async def test_two_legs_between_connected_accounts_become_one_transfer(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item = await _item(db, test_org, test_user)
        checking = await _account(db, test_org, test_user, item)
        savings = await _account(
            db, test_org, test_user, item, plaid_account_id="plaid-savings",
            account_type="savings", name="Savings",
        )
        result, _ = await _sync(db, item, _batch(added=[
            _txn("t-out", amount="500.00", name="Transfer to savings", primary="TRANSFER_OUT"),
            _txn(
                "t-in", account_id="plaid-savings", amount="-500.00",
                day=_DAY + _dt.timedelta(days=1), name="Transfer from checking",
                primary="TRANSFER_IN",
            ),
        ]))

        assert (result.added, result.transfers_matched) == (1, 1)
        rows = await _rows(db, test_org)
        assert len(rows) == 1
        transfer = rows[0]
        assert transfer.transaction_type == "transfer"
        assert transfer.category == "transfer"
        assert transfer.account_id == checking.id
        assert transfer.transfer_to_account_id == savings.id
        assert transfer.transaction_date == _DAY
        assert transfer.tax_relevant is False

    async def test_the_incoming_leg_first_still_records_where_the_money_left(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item = await _item(db, test_org, test_user)
        checking = await _account(db, test_org, test_user, item)
        savings = await _account(
            db, test_org, test_user, item, plaid_account_id="plaid-savings",
            account_type="savings", name="Savings",
        )
        await _sync(db, item, _batch(added=[_txn(
            "t-in", account_id="plaid-savings", amount="-200.00",
            day=_DAY + _dt.timedelta(days=2), primary="TRANSFER_IN",
        )]))
        result, _ = await _sync(db, item, _batch(added=[
            _txn("t-out", amount="200.00", primary="TRANSFER_OUT"),
        ]))

        assert result.transfers_matched == 1
        (transfer,) = await _rows(db, test_org)
        assert (transfer.account_id, transfer.transfer_to_account_id) == (checking.id, savings.id)
        assert transfer.transaction_date == _DAY

    async def test_same_amount_rows_plaid_does_not_call_transfers_are_not_paired(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item = await _item(db, test_org, test_user)
        await _account(db, test_org, test_user, item)
        await _account(
            db, test_org, test_user, item, plaid_account_id="plaid-card",
            account_type="credit_card", name="Card",
        )
        result, _ = await _sync(db, item, _batch(added=[
            _txn("t-buy", amount="40.00", primary="GENERAL_MERCHANDISE"),
            _txn("t-refund", account_id="plaid-card", amount="-40.00", primary="TRANSFER_IN"),
        ]))
        assert (result.added, result.transfers_matched) == (2, 0)


class TestCategoriesAndBalances:
    async def test_personal_spending_gets_the_obvious_category(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        groceries = SpendingCategory(id=uuid.uuid4(), organization_id=test_org.id, name="Groceries")
        db.add(groceries)
        await db.commit()
        item = await _item(db, test_org, test_user)
        await _account(db, test_org, test_user, item)

        await _sync(db, item, _batch(added=[
            _txn("t-food", primary="FOOD_AND_DRINK", detailed="FOOD_AND_DRINK_GROCERIES"),
            _txn("t-rent", amount="1500.00", primary="RENT_AND_UTILITIES", detailed="RENT_AND_UTILITIES_RENT"),
        ]))

        rows = {r.external_id: r for r in await _rows(db, test_org)}
        assert rows["t-food"].spending_category_id == groceries.id
        assert rows["t-food"].external_category == "FOOD_AND_DRINK"
        assert rows["t-rent"].spending_category_id is None

    async def test_a_rental_account_files_rows_as_rental_without_a_spending_category(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item = await _item(db, test_org, test_user)
        await _account(db, test_org, test_user, item, scope="rental")
        await _sync(db, item, _batch(added=[_txn("t-1", name="Home Depot")]))
        (row,) = await _rows(db, test_org)
        assert row.transaction_scope == "rental"
        assert row.spending_category_id is None

    async def test_balances_update_from_the_sync(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item = await _item(db, test_org, test_user)
        account = await _account(db, test_org, test_user, item)
        await _sync(db, item, _batch(accounts=[PlaidWireAccount(
            account_id="plaid-checking", name="Checking", type="depository", subtype="checking",
            balances=PlaidWireBalances(current=Decimal("1234.56")),
        )]))
        await db.refresh(account)
        assert account.current_balance_cents == 123456
        assert account.balance_as_of is not None


class TestTaxReturnStaleness:
    async def _counted_rental_row(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> tuple[PlaidItem, TaxReturn]:
        item = await _item(db, test_org, test_user)
        await _account(db, test_org, test_user, item, scope="rental")
        await _sync(db, item, _batch(added=[_txn("t-1", amount="80.00")]))
        row = (await _rows(db, test_org))[0]
        row.status = "approved"
        row.tax_relevant = True
        row.category = "maintenance"
        draft = TaxReturn(organization_id=test_org.id, tax_year=_DAY.year, needs_recompute=False)
        db.add(draft)
        await db.commit()
        return item, draft

    async def test_a_bank_edit_to_a_counted_row_marks_the_unfiled_return_out_of_date(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item, draft = await self._counted_rental_row(db, test_user, test_org)

        await _sync(db, item, _batch(modified=[_txn("t-1", amount="95.00")]))

        await db.refresh(draft)
        assert draft.needs_recompute is True

    async def test_a_bank_edit_that_moves_no_total_leaves_the_return_alone(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item, draft = await self._counted_rental_row(db, test_user, test_org)

        await _sync(db, item, _batch(modified=[_txn("t-1", amount="80.00", name="Corner Store #2")]))

        await db.refresh(draft)
        assert draft.needs_recompute is False


class TestErrors:
    async def test_item_login_required_marks_the_item_for_reconnect(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item = await _item(db, test_org, test_user)
        client = AsyncMock(side_effect=PlaidApiError(
            endpoint="/transactions/sync", status_code=400, error_type="ITEM_ERROR",
            error_code="ITEM_LOGIN_REQUIRED", request_id="req-2",
        ))
        with _session(db), patch(_CLIENT, client):
            result = await svc.sync_item(item.id)

        assert result.status == "login_required"
        await db.refresh(item)
        assert (item.status, item.error_type, item.error_code) == (
            "login_required", "ITEM_ERROR", "ITEM_LOGIN_REQUIRED",
        )

    async def test_sync_now_refuses_an_item_waiting_on_reconnect(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item = await _item(db, test_org, test_user, status="login_required")
        client = AsyncMock()
        with _session(db), patch(_CLIENT, client), pytest.raises(PlaidLoginRequiredError):
            await svc.sync_for_user(item_id=item.id, user_id=test_user.id, organization_id=test_org.id)
        client.assert_not_awaited()

    async def test_sync_now_never_reaches_someone_elses_connection(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        item = await _item(db, test_org, test_user)
        with _session(db), pytest.raises(PlaidItemNotFoundError):
            await svc.sync_for_user(item_id=item.id, user_id=uuid.uuid4(), organization_id=test_org.id)

    async def test_the_daily_sync_skips_items_waiting_on_their_owner(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        active = await _item(db, test_org, test_user)
        await _item(db, test_org, test_user, status="login_required")
        sync = AsyncMock()
        with _session(db), patch.object(svc, "sync_item_in_background", sync):
            attempted = await svc.sync_all_active()
        assert attempted == 1
        sync.assert_awaited_once_with(active.id)
