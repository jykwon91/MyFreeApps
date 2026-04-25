import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.services.extraction.dedup_service import DedupDecision, evaluate_dedup
from app.services.extraction.dedup_resolution_service import handle_amount_conflict


@pytest_asyncio.fixture()
async def user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="dedup@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture()
async def org(db: AsyncSession, user: User) -> Organization:
    org = Organization(id=uuid.uuid4(), name="Test Org", created_by=user.id)
    db.add(org)
    await db.commit()
    await db.refresh(org)
    return org


@pytest_asyncio.fixture()
async def existing_txn(db: AsyncSession, user: User, org: Organization) -> Transaction:
    txn = Transaction(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        vendor="AT&T",
        transaction_date=date(2025, 6, 15),
        tax_year=2025,
        amount=Decimal("150.00"),
        transaction_type="expense",
        category="utilities",
        tags=["utilities"],
        tax_relevant=True,
        status="pending",
    )
    db.add(txn)
    await db.commit()
    await db.refresh(txn)
    return txn


class TestEvaluateDedup:
    @pytest.mark.asyncio
    async def test_no_duplicate_when_no_match(
        self, db: AsyncSession, user: User, org: Organization,
    ) -> None:
        result = await evaluate_dedup(
            db,
            organization_id=org.id,
            vendor="NewVendor",
            doc_date=datetime(2025, 7, 1, tzinfo=timezone.utc),
            amount=Decimal("100.00"),
            line_items=None,
            property_id=None,
        )
        assert result.action == "create"
        assert result.existing_transaction is None

    @pytest.mark.asyncio
    async def test_finds_vendor_date_match(
        self, db: AsyncSession, user: User, org: Organization, existing_txn: Transaction,
    ) -> None:
        result = await evaluate_dedup(
            db,
            organization_id=org.id,
            vendor="AT&T",
            doc_date=datetime(2025, 6, 15, tzinfo=timezone.utc),
            amount=Decimal("150.00"),
            line_items=None,
            property_id=None,
        )
        assert result.action == "skip"
        assert result.existing_transaction is not None
        assert result.existing_transaction.id == existing_txn.id
        assert result.confidence == "high"

    @pytest.mark.asyncio
    async def test_amounts_mismatch_sent_to_review(
        self, db: AsyncSession, user: User, org: Organization, existing_txn: Transaction,
    ) -> None:
        result = await evaluate_dedup(
            db,
            organization_id=org.id,
            vendor="AT&T",
            doc_date=datetime(2025, 6, 15, tzinfo=timezone.utc),
            amount=Decimal("200.00"),
            line_items=None,
            property_id=None,
        )
        assert result.action == "review"
        assert result.existing_transaction is not None
        assert result.existing_transaction.id == existing_txn.id

    @pytest.mark.asyncio
    async def test_excludes_self(
        self, db: AsyncSession, user: User, org: Organization, existing_txn: Transaction,
    ) -> None:
        result = await evaluate_dedup(
            db,
            organization_id=org.id,
            vendor="AT&T",
            doc_date=datetime(2025, 6, 15, tzinfo=timezone.utc),
            amount=Decimal("150.00"),
            line_items=None,
            property_id=None,
            exclude_id=existing_txn.id,
        )
        assert result.action == "create"

    @pytest.mark.asyncio
    async def test_no_match_without_vendor_or_date(
        self, db: AsyncSession, user: User, org: Organization, existing_txn: Transaction,
    ) -> None:
        result = await evaluate_dedup(
            db,
            organization_id=org.id,
            vendor=None,
            doc_date=None,
            amount=Decimal("150.00"),
            line_items=None,
            property_id=None,
        )
        assert result.action == "create"


class TestHandleAmountConflict:
    @pytest.mark.asyncio
    async def test_sets_needs_review_on_conflict(
        self, db: AsyncSession, user: User, org: Organization, existing_txn: Transaction,
    ) -> None:
        handle_amount_conflict(existing_txn, Decimal("200.00"))
        assert existing_txn.status == "needs_review"
        assert existing_txn.review_fields is not None
        assert "amount" in existing_txn.review_fields

    @pytest.mark.asyncio
    async def test_no_change_when_amounts_match(
        self, db: AsyncSession, user: User, org: Organization, existing_txn: Transaction,
    ) -> None:
        original_status = existing_txn.status
        handle_amount_conflict(existing_txn, Decimal("150.00"))
        assert existing_txn.status == original_status

    @pytest.mark.asyncio
    async def test_no_change_when_new_amount_is_none(
        self, db: AsyncSession, user: User, org: Organization, existing_txn: Transaction,
    ) -> None:
        original_status = existing_txn.status
        handle_amount_conflict(existing_txn, None)
        assert existing_txn.status == original_status
