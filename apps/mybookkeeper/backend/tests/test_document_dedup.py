"""Tests for transaction-based dedup detection queries and tag sanitization.

After the Phase 3 cutover, dedup operates on transactions, not documents.
"""

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch, MagicMock

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories import transaction_repo


async def create_user(db: AsyncSession) -> tuple[User, uuid.UUID]:
    """Create a test user with a personal org. Returns (user, org_id)."""
    user = User(
        id=uuid.uuid4(),
        email=f"test-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    org = Organization(id=uuid.uuid4(), name="Test Org", created_by=user.id)
    db.add(org)
    await db.commit()
    await db.refresh(user)
    return user, org.id


def make_txn(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    vendor: str = "Test Vendor",
    txn_date: date | None = None,
    amount: Decimal | None = Decimal("100.00"),
    property_id: uuid.UUID | None = None,
    status: str = "pending",
    tags: list[str] | None = None,
) -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        vendor=vendor,
        transaction_date=txn_date or date(2025, 6, 15),
        tax_year=2025,
        amount=amount,
        transaction_type="expense",
        category="maintenance",
        tags=tags or ["maintenance"],
        tax_relevant=True,
        property_id=property_id,
        status=status,
    )


# ---------------------------------------------------------------------------
# find_duplicate_by_vendor_date (on transactions)
# ---------------------------------------------------------------------------

class TestFindDuplicateByVendorDate:

    @pytest.mark.asyncio
    async def test_exact_match(self, db: AsyncSession) -> None:
        user, org_id = await create_user(db)
        txn = make_txn(org_id, user.id)
        db.add(txn)
        await db.commit()

        result = await transaction_repo.find_duplicate_by_vendor_date(
            db, org_id, "Test Vendor", txn.transaction_date,
        )
        assert result is not None
        assert result.id == txn.id

    @pytest.mark.asyncio
    async def test_case_insensitive_vendor(self, db: AsyncSession) -> None:
        user, org_id = await create_user(db)
        txn = make_txn(org_id, user.id, vendor="All Service Maintenance")
        db.add(txn)
        await db.commit()

        result = await transaction_repo.find_duplicate_by_vendor_date(
            db, org_id, "all service maintenance", txn.transaction_date,
        )
        assert result is not None
        assert result.id == txn.id

    @pytest.mark.asyncio
    async def test_different_vendor_no_match(self, db: AsyncSession) -> None:
        user, org_id = await create_user(db)
        txn = make_txn(org_id, user.id, vendor="Vendor A")
        db.add(txn)
        await db.commit()

        result = await transaction_repo.find_duplicate_by_vendor_date(
            db, org_id, "Vendor B", txn.transaction_date,
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_different_date_no_match(self, db: AsyncSession) -> None:
        user, org_id = await create_user(db)
        txn = make_txn(org_id, user.id)
        db.add(txn)
        await db.commit()

        different_date = date(2025, 7, 1)
        result = await transaction_repo.find_duplicate_by_vendor_date(
            db, org_id, "Test Vendor", different_date,
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_exclude_id_skips_self(self, db: AsyncSession) -> None:
        user, org_id = await create_user(db)
        txn = make_txn(org_id, user.id)
        db.add(txn)
        await db.commit()

        result = await transaction_repo.find_duplicate_by_vendor_date(
            db, org_id, "Test Vendor", txn.transaction_date,
            exclude_id=txn.id,
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_user_isolation(self, db: AsyncSession) -> None:
        user, org_id = await create_user(db)
        txn = make_txn(org_id, user.id)
        db.add(txn)
        await db.commit()

        other_org_id = uuid.uuid4()
        result = await transaction_repo.find_duplicate_by_vendor_date(
            db, other_org_id, "Test Vendor", txn.transaction_date,
        )
        assert result is None


# ---------------------------------------------------------------------------
# find_possible_match_by_date_amount (on transactions)
# ---------------------------------------------------------------------------

class TestFindPossibleMatchByDateAmount:

    @pytest.mark.asyncio
    async def test_matches_same_date_amount_property(self, db: AsyncSession) -> None:
        user, org_id = await create_user(db)
        prop_id = uuid.uuid4()
        prop = Property(id=prop_id, user_id=user.id, organization_id=org_id, name="123 Main", address="123 Main St")
        txn = make_txn(org_id, user.id, amount=Decimal("500.00"), property_id=prop_id)
        db.add_all([prop, txn])
        await db.commit()

        result = await transaction_repo.find_possible_match_by_date_amount(
            db, org_id, txn.transaction_date, Decimal("500.00"), property_id=prop_id,
        )
        assert result is not None
        assert result.id == txn.id

    @pytest.mark.asyncio
    async def test_different_amount_no_match(self, db: AsyncSession) -> None:
        user, org_id = await create_user(db)
        txn = make_txn(org_id, user.id, amount=Decimal("500.00"))
        db.add(txn)
        await db.commit()

        result = await transaction_repo.find_possible_match_by_date_amount(
            db, org_id, txn.transaction_date, Decimal("999.00"),
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_exclude_id(self, db: AsyncSession) -> None:
        user, org_id = await create_user(db)
        txn = make_txn(org_id, user.id)
        db.add(txn)
        await db.commit()

        result = await transaction_repo.find_possible_match_by_date_amount(
            db, org_id, txn.transaction_date, Decimal("100.00"),
            exclude_id=txn.id,
        )
        assert result is None


# ---------------------------------------------------------------------------
# Vendor normalization in dedup context
# ---------------------------------------------------------------------------

class TestVendorNormalizationInDedup:

    @pytest.mark.asyncio
    async def test_vendor_with_inc_matches(self, db: AsyncSession) -> None:
        user, org_id = await create_user(db)
        txn = make_txn(org_id, user.id, vendor="All Service Maintenance Inc.")
        db.add(txn)
        await db.commit()

        result = await transaction_repo.find_duplicate_by_vendor_date(
            db, org_id, "All Service Maintenance", txn.transaction_date,
        )
        assert result is not None

    @pytest.mark.asyncio
    async def test_vendor_with_llc_vs_without(self, db: AsyncSession) -> None:
        user, org_id = await create_user(db)
        txn = make_txn(org_id, user.id, vendor="A to Z Services")
        db.add(txn)
        await db.commit()

        result = await transaction_repo.find_duplicate_by_vendor_date(
            db, org_id, "A to Z Services LLC", txn.transaction_date,
        )
        assert result is not None

    @pytest.mark.asyncio
    async def test_genuinely_different_vendors_no_match(self, db: AsyncSession) -> None:
        user, org_id = await create_user(db)
        txn = make_txn(org_id, user.id, vendor="ABC Plumbing")
        db.add(txn)
        await db.commit()

        result = await transaction_repo.find_duplicate_by_vendor_date(
            db, org_id, "XYZ Electrical", txn.transaction_date,
        )
        assert result is None


# ---------------------------------------------------------------------------
# Tag sanitization edge cases (not document-dependent)
# ---------------------------------------------------------------------------

class TestTagSanitization:

    def test_sanitize_tags_empty_list_returns_empty(self) -> None:
        from app.core.tags import sanitize_tags
        assert sanitize_tags([]) == []

    def test_sanitize_tags_two_revenue_tags_keeps_last(self) -> None:
        from app.core.tags import sanitize_tags
        result = sanitize_tags(["rental_revenue", "cleaning_fee_revenue"])
        assert result == ["cleaning_fee_revenue"]

    def test_sanitize_tags_two_expense_tags_keeps_last(self) -> None:
        from app.core.tags import sanitize_tags
        result = sanitize_tags(["maintenance", "channel_fee"])
        assert result == ["channel_fee"]

    def test_sanitize_tags_revenue_and_expense_both_kept(self) -> None:
        from app.core.tags import sanitize_tags
        result = sanitize_tags(["rental_revenue", "maintenance"])
        assert "rental_revenue" in result
        assert "maintenance" in result
        assert len(result) == 2


# ---------------------------------------------------------------------------
# Adversarial / edge-case inputs
# ---------------------------------------------------------------------------

class TestAdversarialInputs:

    def test_normalize_vendor_whitespace_only_returns_empty(self) -> None:
        from app.core.vendors import normalize_vendor
        assert normalize_vendor('   ') == ''

    def test_normalize_vendor_none_returns_empty(self) -> None:
        from app.core.vendors import normalize_vendor
        assert normalize_vendor(None) == ''

    def test_normalize_vendor_empty_string_returns_empty(self) -> None:
        from app.core.vendors import normalize_vendor
        assert normalize_vendor('') == ''

    def test_normalize_vendor_extra_internal_whitespace_collapsed(self) -> None:
        from app.core.vendors import normalize_vendor
        assert normalize_vendor('Bob   Jones   LLC') == 'bob jones'

    @pytest.mark.asyncio
    async def test_dates_one_day_apart_no_match(self, db: AsyncSession) -> None:
        user, org_id = await create_user(db)
        date_a = date(2025, 6, 15)
        date_b = date(2025, 6, 16)
        txn = make_txn(org_id, user.id, txn_date=date_a)
        db.add(txn)
        await db.commit()

        result = await transaction_repo.find_duplicate_by_vendor_date(
            db, org_id, 'Test Vendor', date_b,
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_same_date_different_vendor_no_match(self, db: AsyncSession) -> None:
        user, org_id = await create_user(db)
        txn_date = date(2025, 6, 15)
        txn = make_txn(org_id, user.id, vendor='Acme Plumbing', txn_date=txn_date)
        db.add(txn)
        await db.commit()

        result = await transaction_repo.find_duplicate_by_vendor_date(
            db, org_id, 'Other Vendor', txn_date,
        )
        assert result is None
