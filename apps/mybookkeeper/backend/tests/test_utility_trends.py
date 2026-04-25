"""Tests for utility trends analytics — repo, service, and extraction mapper sub_category handling."""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.tags import UTILITY_SUB_CATEGORIES
from app.mappers.extraction_mapper import map_single_item
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories.analytics import utility_trends_repo


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

async def _setup_org_and_user(db: AsyncSession) -> tuple[User, uuid.UUID]:
    user = User(
        id=uuid.uuid4(),
        email=f"test-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    org = Organization(id=uuid.uuid4(), name="Analytics Test Org", created_by=user.id)
    db.add(org)
    await db.commit()
    await db.refresh(user)
    await db.refresh(org)
    return user, org.id


def _make_transaction(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    property_id: uuid.UUID | None = None,
    amount: Decimal = Decimal("100.00"),
    category: str = "utilities",
    sub_category: str | None = "electricity",
    txn_date: date = date(2025, 1, 15),
    status: str = "approved",
) -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        property_id=property_id,
        transaction_date=txn_date,
        tax_year=txn_date.year,
        amount=amount,
        transaction_type="expense",
        category=category,
        sub_category=sub_category,
        tags=[category],
        status=status,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


# ---------------------------------------------------------------------------
# UTILITY_SUB_CATEGORIES constant
# ---------------------------------------------------------------------------

class TestUtilitySubCategoriesConstant:
    def test_contains_all_expected_values(self) -> None:
        expected = {"electricity", "water", "gas", "internet", "trash", "sewer"}
        assert UTILITY_SUB_CATEGORIES == expected

    def test_is_frozen(self) -> None:
        with pytest.raises((AttributeError, TypeError)):
            UTILITY_SUB_CATEGORIES.add("other")  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Extraction mapper — sub_category handling
# ---------------------------------------------------------------------------

class TestExtractionMapperSubCategory:
    def test_valid_sub_category_for_utilities(self) -> None:
        item = map_single_item(
            {
                "document_type": "invoice",
                "vendor": "TXU Energy",
                "amount": "120.00",
                "date": "2025-03-01",
                "tags": ["utilities"],
                "category": "utilities",
                "sub_category": "electricity",
                "tax_relevant": True,
            },
            property_id=None,
        )
        assert item.sub_category == "electricity"

    def test_sub_category_null_for_non_utilities(self) -> None:
        item = map_single_item(
            {
                "document_type": "invoice",
                "vendor": "ABC Plumbing",
                "amount": "250.00",
                "date": "2025-03-01",
                "tags": ["maintenance"],
                "category": "maintenance",
                "sub_category": "electricity",  # should be ignored for non-utility
                "tax_relevant": True,
            },
            property_id=None,
        )
        assert item.sub_category is None

    def test_invalid_sub_category_value_returns_none(self) -> None:
        item = map_single_item(
            {
                "document_type": "invoice",
                "vendor": "City Utilities",
                "amount": "80.00",
                "date": "2025-03-01",
                "tags": ["utilities"],
                "category": "utilities",
                "sub_category": "combined_bill",  # not a valid value
                "tax_relevant": True,
            },
            property_id=None,
        )
        assert item.sub_category is None

    def test_missing_sub_category_returns_none(self) -> None:
        item = map_single_item(
            {
                "document_type": "invoice",
                "vendor": "Atmos Energy",
                "amount": "60.00",
                "date": "2025-03-01",
                "tags": ["utilities"],
                "category": "utilities",
                "tax_relevant": True,
            },
            property_id=None,
        )
        assert item.sub_category is None

    def test_all_valid_sub_categories_are_accepted(self) -> None:
        for sub_cat in UTILITY_SUB_CATEGORIES:
            item = map_single_item(
                {
                    "document_type": "invoice",
                    "vendor": "Utility Corp",
                    "amount": "50.00",
                    "date": "2025-03-01",
                    "tags": ["utilities"],
                    "category": "utilities",
                    "sub_category": sub_cat,
                    "tax_relevant": True,
                },
                property_id=None,
            )
            assert item.sub_category == sub_cat, f"Expected {sub_cat} to be accepted"


# ---------------------------------------------------------------------------
# Utility trends repository — get_utility_trends
# ---------------------------------------------------------------------------

class TestGetUtilityTrendsRepo:
    @pytest.mark.anyio
    async def test_returns_grouped_monthly_rows(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        txn1 = _make_transaction(org_id, user.id, sub_category="electricity", amount=Decimal("100.00"), txn_date=date(2025, 1, 10))
        txn2 = _make_transaction(org_id, user.id, sub_category="electricity", amount=Decimal("50.00"), txn_date=date(2025, 1, 20))
        txn3 = _make_transaction(org_id, user.id, sub_category="water", amount=Decimal("30.00"), txn_date=date(2025, 1, 15))
        db.add_all([txn1, txn2, txn3])
        await db.commit()

        rows = await utility_trends_repo.get_utility_trends(db, org_id)
        # Row shape: year, month, sub_category, property_id, property_name, total
        totals = {(r.sub_category, int(r.year), int(r.month)): float(r.total) for r in rows}

        assert totals.get(("electricity", 2025, 1)) == pytest.approx(150.0)
        assert totals.get(("water", 2025, 1)) == pytest.approx(30.0)

    @pytest.mark.anyio
    async def test_excludes_non_utility_transactions(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        utility_txn = _make_transaction(org_id, user.id, sub_category="gas", amount=Decimal("80.00"))
        maintenance_txn = _make_transaction(
            org_id, user.id, category="maintenance", sub_category=None, amount=Decimal("200.00"),
        )
        db.add_all([utility_txn, maintenance_txn])
        await db.commit()

        rows = await utility_trends_repo.get_utility_trends(db, org_id)
        sub_cats = {r.sub_category for r in rows}
        assert "gas" in sub_cats
        assert None not in sub_cats

    @pytest.mark.anyio
    async def test_excludes_transactions_without_sub_category(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        # Utility with no sub_category (ambiguous municipal bill)
        ambiguous = _make_transaction(org_id, user.id, sub_category=None)
        db.add(ambiguous)
        await db.commit()

        rows = await utility_trends_repo.get_utility_trends(db, org_id)
        assert len(rows) == 0

    @pytest.mark.anyio
    async def test_excludes_soft_deleted_transactions(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        deleted_txn = _make_transaction(org_id, user.id, sub_category="electricity")
        deleted_txn.deleted_at = datetime.now(timezone.utc)
        db.add(deleted_txn)
        await db.commit()

        rows = await utility_trends_repo.get_utility_trends(db, org_id)
        assert len(rows) == 0

    @pytest.mark.anyio
    async def test_excludes_pending_and_needs_review_transactions(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        pending = _make_transaction(org_id, user.id, sub_category="water", status="pending")
        needs_review = _make_transaction(org_id, user.id, sub_category="water", status="needs_review")
        approved = _make_transaction(org_id, user.id, sub_category="water", status="approved", amount=Decimal("40.00"))
        db.add_all([pending, needs_review, approved])
        await db.commit()

        rows = await utility_trends_repo.get_utility_trends(db, org_id)
        assert len(rows) == 1
        assert float(rows[0].total) == pytest.approx(40.0)

    @pytest.mark.anyio
    async def test_filters_by_date_range(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        jan_txn = _make_transaction(org_id, user.id, sub_category="electricity", amount=Decimal("100.00"), txn_date=date(2025, 1, 15))
        mar_txn = _make_transaction(org_id, user.id, sub_category="electricity", amount=Decimal("90.00"), txn_date=date(2025, 3, 15))
        db.add_all([jan_txn, mar_txn])
        await db.commit()

        rows = await utility_trends_repo.get_utility_trends(
            db, org_id,
            start_date=date(2025, 2, 1),
            end_date=date(2025, 4, 30),
        )
        assert len(rows) == 1
        assert float(rows[0].total) == pytest.approx(90.0)

    @pytest.mark.anyio
    async def test_filters_by_property_ids(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = Property(id=uuid.uuid4(), organization_id=org_id, user_id=user.id, name="Beach House")
        db.add(prop)
        await db.flush()

        prop_txn = _make_transaction(org_id, user.id, sub_category="electricity", property_id=prop.id, amount=Decimal("120.00"))
        no_prop_txn = _make_transaction(org_id, user.id, sub_category="electricity", amount=Decimal("80.00"))
        db.add_all([prop_txn, no_prop_txn])
        await db.commit()

        rows = await utility_trends_repo.get_utility_trends(db, org_id, property_ids=[prop.id])
        assert len(rows) == 1
        assert float(rows[0].total) == pytest.approx(120.0)

    @pytest.mark.anyio
    async def test_quarterly_granularity_groups_months(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        jan = _make_transaction(org_id, user.id, sub_category="electricity", amount=Decimal("100.00"), txn_date=date(2025, 1, 15))
        feb = _make_transaction(org_id, user.id, sub_category="electricity", amount=Decimal("80.00"), txn_date=date(2025, 2, 15))
        apr = _make_transaction(org_id, user.id, sub_category="electricity", amount=Decimal("60.00"), txn_date=date(2025, 4, 15))
        db.add_all([jan, feb, apr])
        await db.commit()

        rows = await utility_trends_repo.get_utility_trends(db, org_id, granularity="quarterly")
        # Jan + Feb → Q1, Apr → Q2
        assert len(rows) == 2
        totals = {int(r.quarter): float(r.total) for r in rows}
        assert totals[1] == pytest.approx(180.0)
        assert totals[2] == pytest.approx(60.0)

    @pytest.mark.anyio
    async def test_isolates_by_organization(self, db: AsyncSession) -> None:
        user1, org1_id = await _setup_org_and_user(db)
        user2, org2_id = await _setup_org_and_user(db)
        txn_org1 = _make_transaction(org1_id, user1.id, sub_category="internet", amount=Decimal("50.00"))
        txn_org2 = _make_transaction(org2_id, user2.id, sub_category="internet", amount=Decimal("75.00"))
        db.add_all([txn_org1, txn_org2])
        await db.commit()

        rows = await utility_trends_repo.get_utility_trends(db, org1_id)
        assert len(rows) == 1
        assert float(rows[0].total) == pytest.approx(50.0)


# ---------------------------------------------------------------------------
# Utility summary repository — get_utility_summary
# ---------------------------------------------------------------------------

class TestGetUtilitySummaryRepo:
    @pytest.mark.anyio
    async def test_returns_total_per_sub_category(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        db.add_all([
            _make_transaction(org_id, user.id, sub_category="electricity", amount=Decimal("100.00"), txn_date=date(2025, 1, 10)),
            _make_transaction(org_id, user.id, sub_category="electricity", amount=Decimal("50.00"), txn_date=date(2025, 2, 10)),
            _make_transaction(org_id, user.id, sub_category="water", amount=Decimal("30.00"), txn_date=date(2025, 1, 15)),
        ])
        await db.commit()

        rows = await utility_trends_repo.get_utility_summary(db, org_id)
        totals = {r.sub_category: float(r.total) for r in rows}
        assert totals["electricity"] == pytest.approx(150.0)
        assert totals["water"] == pytest.approx(30.0)

    @pytest.mark.anyio
    async def test_no_time_dimension(self, db: AsyncSession) -> None:
        """Summary collapses all months into a single row per sub_category."""
        user, org_id = await _setup_org_and_user(db)
        for month in [1, 2, 3]:
            db.add(_make_transaction(
                org_id, user.id, sub_category="gas",
                amount=Decimal("20.00"), txn_date=date(2025, month, 1),
            ))
        await db.commit()

        rows = await utility_trends_repo.get_utility_summary(db, org_id)
        assert len(rows) == 1
        assert float(rows[0].total) == pytest.approx(60.0)


# ---------------------------------------------------------------------------
# Analytics service — period formatting
# ---------------------------------------------------------------------------

class TestUtilityTrendsServiceFormatPeriod:
    def test_monthly_format(self) -> None:
        from app.services.analytics.utility_trends_service import _format_period
        assert _format_period(2025, 3, "monthly") == "2025-03"

    def test_quarterly_format_q1(self) -> None:
        from app.services.analytics.utility_trends_service import _format_period
        assert _format_period(2025, 1, "quarterly") == "2025-Q1"

    def test_quarterly_format_q2(self) -> None:
        from app.services.analytics.utility_trends_service import _format_period
        assert _format_period(2025, 2, "quarterly") == "2025-Q2"

    def test_quarterly_format_q3(self) -> None:
        from app.services.analytics.utility_trends_service import _format_period
        assert _format_period(2025, 3, "quarterly") == "2025-Q3"

    def test_quarterly_format_q4(self) -> None:
        from app.services.analytics.utility_trends_service import _format_period
        assert _format_period(2025, 4, "quarterly") == "2025-Q4"

    def test_monthly_zero_pads_month(self) -> None:
        from app.services.analytics.utility_trends_service import _format_period
        assert _format_period(2025, 9, "monthly") == "2025-09"
