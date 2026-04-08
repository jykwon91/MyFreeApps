import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.integrations.plaid_account import PlaidAccount
from app.models.integrations.plaid_item import PlaidItem
from app.models.transactions.transaction import Transaction
from app.services.integrations.plaid_sync_service import (
    map_plaid_category,
    should_skip_transaction,
    sync_plaid_item,
)


# ---------------------------------------------------------------------------
# Category mapping
# ---------------------------------------------------------------------------

class TestMapPlaidCategory:
    def test_rent_maps_to_rental_revenue(self) -> None:
        category, txn_type = map_plaid_category("RENT")
        assert category == "rental_revenue"
        assert txn_type == "income"

    def test_income_maps_to_rental_revenue(self) -> None:
        category, txn_type = map_plaid_category("INCOME")
        assert category == "rental_revenue"
        assert txn_type == "income"

    def test_insurance_maps_to_insurance(self) -> None:
        category, txn_type = map_plaid_category("INSURANCE")
        assert category == "insurance"
        assert txn_type == "expense"

    def test_utilities_maps_to_utilities(self) -> None:
        category, txn_type = map_plaid_category("UTILITIES")
        assert category == "utilities"
        assert txn_type == "expense"

    def test_home_improvement_maps_to_maintenance(self) -> None:
        category, txn_type = map_plaid_category("HOME_IMPROVEMENT")
        assert category == "maintenance"
        assert txn_type == "expense"

    def test_tax_maps_to_taxes(self) -> None:
        category, txn_type = map_plaid_category("TAX_PAYMENT")
        assert category == "taxes"
        assert txn_type == "expense"

    def test_unknown_maps_to_other_expense(self) -> None:
        category, txn_type = map_plaid_category("FOOD_AND_DRINK")
        assert category == "other_expense"
        assert txn_type == "expense"

    def test_none_maps_to_uncategorized(self) -> None:
        category, txn_type = map_plaid_category(None)
        assert category == "uncategorized"
        assert txn_type == "expense"

    def test_transfer_in_maps_to_uncategorized(self) -> None:
        category, txn_type = map_plaid_category("TRANSFER_IN")
        assert category == "uncategorized"
        assert txn_type == "expense"


class TestShouldSkipTransaction:
    def test_transfer_in_skipped(self) -> None:
        assert should_skip_transaction("TRANSFER_IN") is True

    def test_transfer_out_skipped(self) -> None:
        assert should_skip_transaction("TRANSFER_OUT") is True

    def test_rent_not_skipped(self) -> None:
        assert should_skip_transaction("RENT") is False

    def test_none_not_skipped(self) -> None:
        assert should_skip_transaction(None) is False


# ---------------------------------------------------------------------------
# Transaction creation (with mocked Plaid client)
# ---------------------------------------------------------------------------

def _make_plaid_item(org_id: uuid.UUID, user_id: uuid.UUID) -> PlaidItem:
    return PlaidItem(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        plaid_item_id="test_item_123",
        access_token="encrypted_token",
        status="active",
    )


def _make_plaid_txn(
    *,
    transaction_id: str = "txn_001",
    account_id: str = "acc_001",
    amount: float = -45.50,
    txn_date: str = "2026-01-15",
    name: str = "Electric Company",
    merchant_name: str | None = "Duke Energy",
    pending: bool = False,
    category: str | None = "UTILITIES",
) -> dict:
    return {
        "transaction_id": transaction_id,
        "account_id": account_id,
        "amount": amount,
        "date": txn_date,
        "name": name,
        "merchant_name": merchant_name,
        "pending": pending,
        "personal_finance_category": category,
        "payment_channel": "online",
    }


@pytest.fixture()
def org_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture()
def user_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.mark.asyncio
async def test_sync_creates_transaction(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID,
) -> None:
    """Plaid sync should create a Transaction from added Plaid transactions."""
    from app.integrations.plaid_client import PlaidSyncResult

    plaid_item = _make_plaid_item(org_id, user_id)
    db.add(plaid_item)
    await db.flush()

    sync_result = PlaidSyncResult(
        added=[_make_plaid_txn()],
        modified=[],
        removed=[],
        next_cursor="cursor_1",
        has_more=False,
    )

    with patch("app.services.integrations.plaid_sync_service.decrypt_token", return_value="fake_token"), \
         patch("app.services.integrations.plaid_sync_service.sync_transactions", return_value=sync_result):
        count = await sync_plaid_item(db, plaid_item, org_id, user_id)

    assert count == 1

    result = await db.execute(
        select(Transaction).where(
            Transaction.organization_id == org_id,
            Transaction.external_source == "plaid",
        )
    )
    txn = result.scalar_one()
    assert txn.external_id == "txn_001"
    assert txn.vendor == "Duke Energy"
    assert txn.amount == Decimal("45.50")
    assert txn.category == "utilities"
    assert txn.transaction_type == "expense"
    assert txn.is_pending is False
    assert txn.status == "approved"


@pytest.mark.asyncio
async def test_sync_dedup_skips_existing(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID,
) -> None:
    """Plaid sync should skip transactions that already exist by external_id."""
    from app.integrations.plaid_client import PlaidSyncResult

    plaid_item = _make_plaid_item(org_id, user_id)
    db.add(plaid_item)
    await db.flush()

    existing_txn = Transaction(
        organization_id=org_id,
        user_id=user_id,
        transaction_date=date(2026, 1, 15),
        tax_year=2026,
        amount=Decimal("45.50"),
        transaction_type="expense",
        category="utilities",
        external_id="txn_001",
        external_source="plaid",
    )
    db.add(existing_txn)
    await db.flush()

    sync_result = PlaidSyncResult(
        added=[_make_plaid_txn()],
        modified=[],
        removed=[],
        next_cursor="cursor_1",
        has_more=False,
    )

    with patch("app.services.integrations.plaid_sync_service.decrypt_token", return_value="fake_token"), \
         patch("app.services.integrations.plaid_sync_service.sync_transactions", return_value=sync_result):
        count = await sync_plaid_item(db, plaid_item, org_id, user_id)

    assert count == 0


@pytest.mark.asyncio
async def test_sync_pending_to_settled(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID,
) -> None:
    """Modified Plaid transactions should transition pending -> approved."""
    from app.integrations.plaid_client import PlaidSyncResult

    plaid_item = _make_plaid_item(org_id, user_id)
    db.add(plaid_item)
    await db.flush()

    pending_txn = Transaction(
        organization_id=org_id,
        user_id=user_id,
        transaction_date=date(2026, 1, 15),
        tax_year=2026,
        amount=Decimal("45.50"),
        transaction_type="expense",
        category="utilities",
        status="pending",
        external_id="txn_001",
        external_source="plaid",
        is_pending=True,
    )
    db.add(pending_txn)
    await db.flush()

    settled_txn_data = _make_plaid_txn(pending=False, amount=-50.00)

    sync_result = PlaidSyncResult(
        added=[],
        modified=[settled_txn_data],
        removed=[],
        next_cursor="cursor_2",
        has_more=False,
    )

    with patch("app.services.integrations.plaid_sync_service.decrypt_token", return_value="fake_token"), \
         patch("app.services.integrations.plaid_sync_service.sync_transactions", return_value=sync_result):
        await sync_plaid_item(db, plaid_item, org_id, user_id)

    result = await db.execute(
        select(Transaction).where(Transaction.external_id == "txn_001")
    )
    txn = result.scalar_one()
    assert txn.status == "approved"
    assert txn.is_pending is False
    assert txn.amount == Decimal("50.00")


@pytest.mark.asyncio
async def test_sync_account_property_mapping(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID,
) -> None:
    """Transactions should be assigned to the property mapped to the Plaid account."""
    from app.integrations.plaid_client import PlaidSyncResult

    property_id = uuid.uuid4()
    plaid_item = _make_plaid_item(org_id, user_id)
    db.add(plaid_item)
    await db.flush()

    account = PlaidAccount(
        plaid_item_id=plaid_item.id,
        organization_id=org_id,
        plaid_account_id="acc_001",
        property_id=property_id,
        name="Checking",
        account_type="depository",
        is_active=True,
    )
    db.add(account)
    await db.flush()

    sync_result = PlaidSyncResult(
        added=[_make_plaid_txn(account_id="acc_001")],
        modified=[],
        removed=[],
        next_cursor="cursor_3",
        has_more=False,
    )

    with patch("app.services.integrations.plaid_sync_service.decrypt_token", return_value="fake_token"), \
         patch("app.services.integrations.plaid_sync_service.sync_transactions", return_value=sync_result):
        count = await sync_plaid_item(db, plaid_item, org_id, user_id)

    assert count == 1

    result = await db.execute(
        select(Transaction).where(Transaction.external_id == "txn_001")
    )
    txn = result.scalar_one()
    assert txn.property_id == property_id


@pytest.mark.asyncio
async def test_sync_skips_internal_transfers(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID,
) -> None:
    """Plaid transactions with TRANSFER category should be skipped."""
    from app.integrations.plaid_client import PlaidSyncResult

    plaid_item = _make_plaid_item(org_id, user_id)
    db.add(plaid_item)
    await db.flush()

    transfer_txn = _make_plaid_txn(transaction_id="txn_transfer", category="TRANSFER_IN")

    sync_result = PlaidSyncResult(
        added=[transfer_txn],
        modified=[],
        removed=[],
        next_cursor="cursor_4",
        has_more=False,
    )

    with patch("app.services.integrations.plaid_sync_service.decrypt_token", return_value="fake_token"), \
         patch("app.services.integrations.plaid_sync_service.sync_transactions", return_value=sync_result):
        count = await sync_plaid_item(db, plaid_item, org_id, user_id)

    assert count == 0


@pytest.mark.asyncio
async def test_sync_soft_deletes_removed(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID,
) -> None:
    """Removed Plaid transactions should be soft-deleted."""
    from app.integrations.plaid_client import PlaidSyncResult

    plaid_item = _make_plaid_item(org_id, user_id)
    db.add(plaid_item)
    await db.flush()

    existing_txn = Transaction(
        organization_id=org_id,
        user_id=user_id,
        transaction_date=date(2026, 1, 15),
        tax_year=2026,
        amount=Decimal("45.50"),
        transaction_type="expense",
        category="utilities",
        external_id="txn_to_remove",
        external_source="plaid",
    )
    db.add(existing_txn)
    await db.flush()

    sync_result = PlaidSyncResult(
        added=[],
        modified=[],
        removed=["txn_to_remove"],
        next_cursor="cursor_5",
        has_more=False,
    )

    with patch("app.services.integrations.plaid_sync_service.decrypt_token", return_value="fake_token"), \
         patch("app.services.integrations.plaid_sync_service.sync_transactions", return_value=sync_result):
        await sync_plaid_item(db, plaid_item, org_id, user_id)

    result = await db.execute(
        select(Transaction).where(Transaction.external_id == "txn_to_remove")
    )
    txn = result.scalar_one()
    assert txn.deleted_at is not None
    assert txn.status == "duplicate"


@pytest.mark.asyncio
async def test_sync_pending_transaction_created(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID,
) -> None:
    """Pending Plaid transactions should be created with is_pending=True and status='pending'."""
    from app.integrations.plaid_client import PlaidSyncResult

    plaid_item = _make_plaid_item(org_id, user_id)
    db.add(plaid_item)
    await db.flush()

    pending_data = _make_plaid_txn(transaction_id="txn_pending", pending=True)

    sync_result = PlaidSyncResult(
        added=[pending_data],
        modified=[],
        removed=[],
        next_cursor="cursor_6",
        has_more=False,
    )

    with patch("app.services.integrations.plaid_sync_service.decrypt_token", return_value="fake_token"), \
         patch("app.services.integrations.plaid_sync_service.sync_transactions", return_value=sync_result):
        count = await sync_plaid_item(db, plaid_item, org_id, user_id)

    assert count == 1

    result = await db.execute(
        select(Transaction).where(Transaction.external_id == "txn_pending")
    )
    txn = result.scalar_one()
    assert txn.is_pending is True
    assert txn.status == "pending"
