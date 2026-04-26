"""Tests for transaction_service — unit tests with mocked DB sessions."""
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.models.organization.organization import Organization
from app.models.properties.property import Property, PropertyType
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories import transaction_repo
from app.services.transactions import transaction_service


def _make_ctx(org: Organization, user: User) -> RequestContext:
    return RequestContext(
        organization_id=org.id,
        user_id=user.id,
        org_role="owner",
    )


async def _seed(
    db: AsyncSession,
    org: Organization,
    user: User,
    *,
    property_id: uuid.UUID | None = None,
    status: str = "pending",
    vendor: str = "Service Vendor",
) -> Transaction:
    txn = Transaction(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        property_id=property_id,
        transaction_date=date(2025, 6, 15),
        tax_year=2025,
        vendor=vendor,
        amount=Decimal("100.00"),
        transaction_type="expense",
        category="maintenance",
        status=status,
    )
    await transaction_repo.create(db, txn)
    await db.commit()
    await db.refresh(txn)
    return txn


class TestListTransactions:
    @pytest.mark.asyncio
    async def test_lists_filtered(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)
        await _seed(db, test_org, test_user)

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake), patch("app.services.transactions.transaction_service.unit_of_work", _fake):
            results = await transaction_service.list_transactions(ctx)
        assert len(results) >= 1


class TestCreateManualTransaction:
    @pytest.mark.asyncio
    async def test_creates_with_manual_flag(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake), patch("app.services.transactions.transaction_service.unit_of_work", _fake):
            result = await transaction_service.create_manual_transaction(ctx, {
                "transaction_date": date(2025, 6, 15),
                "tax_year": 2025,
                "amount": Decimal("200.00"),
                "transaction_type": "expense",
                "category": "utilities",
            })
        assert result.is_manual is True
        assert result.amount == Decimal("200.00")


class TestGetTransaction:
    @pytest.mark.asyncio
    async def test_returns_by_id(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)
        txn = await _seed(db, test_org, test_user)

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake), patch("app.services.transactions.transaction_service.unit_of_work", _fake):
            found = await transaction_service.get_transaction(ctx, txn.id)
        assert found is not None
        assert found.id == txn.id

    @pytest.mark.asyncio
    async def test_returns_none_for_missing(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake), patch("app.services.transactions.transaction_service.unit_of_work", _fake):
            found = await transaction_service.get_transaction(ctx, uuid.uuid4())
        assert found is None


class TestUpdateTransaction:
    @pytest.mark.asyncio
    async def test_updates_allowed_field(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)
        txn = await _seed(db, test_org, test_user)

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake), patch("app.services.transactions.transaction_service.unit_of_work", _fake):
            result = await transaction_service.update_transaction(
                ctx, txn.id, {"vendor": "New Vendor"},
            )
        assert result is not None
        updated_txn, retroactive_count = result
        assert updated_txn.vendor == "New Vendor"
        assert retroactive_count == 0

    @pytest.mark.asyncio
    async def test_rejects_disallowed_field(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)
        txn = await _seed(db, test_org, test_user)

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake), patch("app.services.transactions.transaction_service.unit_of_work", _fake):
            with pytest.raises(ValueError, match="Cannot update field"):
                await transaction_service.update_transaction(
                    ctx, txn.id, {"organization_id": str(uuid.uuid4())},
                )


class TestDeleteTransaction:
    @pytest.mark.asyncio
    async def test_soft_deletes(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)
        txn = await _seed(db, test_org, test_user)

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake), patch("app.services.transactions.transaction_service.unit_of_work", _fake):
            result = await transaction_service.delete_transaction(ctx, txn.id)
        assert result is True

    @pytest.mark.asyncio
    async def test_returns_false_for_missing(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake), patch("app.services.transactions.transaction_service.unit_of_work", _fake):
            result = await transaction_service.delete_transaction(ctx, uuid.uuid4())
        assert result is False


class TestBulkApprove:
    @pytest.mark.asyncio
    async def test_returns_counts(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)

        prop = Property(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Bulk Prop",
            type=PropertyType.SHORT_TERM,
        )
        db.add(prop)
        await db.flush()

        txn = await _seed(db, test_org, test_user, property_id=prop.id, status="pending")

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake), patch("app.services.transactions.transaction_service.unit_of_work", _fake):
            result = await transaction_service.bulk_approve(ctx, [txn.id])
        assert result["approved"] == 1
        assert result["skipped"] == 0


class TestBulkDelete:
    @pytest.mark.asyncio
    async def test_returns_count(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)
        txn = await _seed(db, test_org, test_user)

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake), patch("app.services.transactions.transaction_service.unit_of_work", _fake):
            result = await transaction_service.bulk_delete(ctx, [txn.id])
        assert result["deleted"] == 1


class TestTransactionFieldValueType:
    """Verify TransactionFieldValue covers all field types from Pydantic schemas."""

    # Concrete types allowed by TransactionFieldValue
    _ALLOWED_TYPES = (str, int, float, bool, Decimal, date, uuid.UUID, list, type(None))

    def test_covers_all_create_fields(self) -> None:
        """Every value in TransactionCreate.model_dump() must be a TransactionFieldValue."""
        from app.schemas.transactions.transaction import TransactionCreate

        sample = TransactionCreate(
            property_id=uuid.uuid4(),
            transaction_date=date(2025, 6, 15),
            tax_year=2025,
            vendor="Test",
            description="desc",
            amount=Decimal("100.00"),
            transaction_type="expense",
            category="maintenance",
            tags=["tag1"],
            tax_relevant=True,
            schedule_e_line="line_7_cleaning_maintenance",
            is_capital_improvement=False,
            channel="airbnb",
            address="123 Main",
            payment_method="check",
        )
        for key, value in sample.model_dump().items():
            assert isinstance(value, self._ALLOWED_TYPES), (
                f"Field '{key}' has type {type(value).__name__} not in TransactionFieldValue"
            )

    def test_covers_all_update_fields(self) -> None:
        """Every value in TransactionUpdate.model_dump(exclude_none=True) must be a TransactionFieldValue."""
        from app.schemas.transactions.transaction import TransactionUpdate

        sample = TransactionUpdate(
            vendor="Updated",
            amount=Decimal("50.00"),
            transaction_date=date(2025, 7, 1),
            tags=["new_tag"],
            tax_relevant=False,
            status="approved",
        )
        for key, value in sample.model_dump(exclude_none=True).items():
            assert isinstance(value, self._ALLOWED_TYPES), (
                f"Field '{key}' has type {type(value).__name__} not in TransactionFieldValue"
            )
