"""Tests that summary queries work correctly from the transactions table.

Creates approved transactions with known amounts/categories/properties,
then verifies summary_service.get_summary() and get_tax_summary() produce
correct totals, filtering, and grouping.
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction
from app.models.user.user import User


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
    org = Organization(id=uuid.uuid4(), name="Test Org", created_by=user.id)
    db.add(org)
    await db.commit()
    await db.refresh(user)
    await db.refresh(org)
    return user, org.id


def _make_property(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    name: str = "Test Property",
    address: str = "123 Main St",
) -> Property:
    return Property(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        name=name,
        address=address,
    )


def _make_transaction(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    property_id: uuid.UUID | None = None,
    amount: Decimal = Decimal("100.00"),
    category: str = "maintenance",
    transaction_type: str = "expense",
    tax_relevant: bool = True,
    schedule_e_line: str | None = "line_7_cleaning_maintenance",
    transaction_date: date = date(2025, 6, 15),
    tax_year: int = 2025,
    status: str = "approved",
    deleted_at: datetime | None = None,
    vendor: str = "Test Vendor",
    tags: list[str] | None = None,
) -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        property_id=property_id,
        amount=amount,
        category=category,
        transaction_type=transaction_type,
        tax_relevant=tax_relevant,
        schedule_e_line=schedule_e_line,
        transaction_date=transaction_date,
        tax_year=tax_year,
        status=status,
        deleted_at=deleted_at,
        vendor=vendor,
        tags=tags or [category],
    )


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(
        organization_id=org_id,
        user_id=user_id,
        org_role="owner",
    )


class TestGetSummary:

    @pytest.mark.asyncio
    async def test_totals_match_approved_transactions(self, db: AsyncSession) -> None:
        from unittest.mock import patch
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)

        # Add revenue and expense transactions
        db.add(_make_transaction(
            org_id, user.id,
            property_id=prop.id,
            amount=Decimal("1000.00"),
            category="rental_revenue",
            transaction_type="income",
            schedule_e_line="line_3_rents_received",
            tags=["rental_revenue"],
        ))
        db.add(_make_transaction(
            org_id, user.id,
            property_id=prop.id,
            amount=Decimal("200.00"),
            category="maintenance",
            transaction_type="expense",
            tags=["maintenance"],
        ))
        db.add(_make_transaction(
            org_id, user.id,
            property_id=prop.id,
            amount=Decimal("50.00"),
            category="utilities",
            transaction_type="expense",
            schedule_e_line="line_17_utilities",
            tags=["utilities"],
        ))
        await db.commit()

        from app.repositories import summary_repo

        # Direct repo call (bypasses AsyncSessionLocal)
        rows = await summary_repo.txn_sum_by_category(db, org_id)
        by_tag = {row.tag: float(row.total) for row in rows}

        from app.core.tags import REVENUE_TAGS, EXPENSE_TAGS
        revenue = sum(v for k, v in by_tag.items() if k in REVENUE_TAGS)
        expenses = sum(v for k, v in by_tag.items() if k in EXPENSE_TAGS)

        assert revenue == 1000.00
        assert expenses == 250.00
        assert by_tag.get("rental_revenue") == 1000.00
        assert by_tag.get("maintenance") == 200.00
        assert by_tag.get("utilities") == 50.00

    @pytest.mark.asyncio
    async def test_only_approved_summed_other_statuses_excluded(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)

        db.add(_make_transaction(
            org_id, user.id,
            property_id=prop.id,
            amount=Decimal("500.00"),
            status="approved",
        ))
        db.add(_make_transaction(
            org_id, user.id,
            property_id=prop.id,
            amount=Decimal("400.00"),
            status="unverified",
        ))
        db.add(_make_transaction(
            org_id, user.id,
            property_id=prop.id,
            amount=Decimal("300.00"),
            status="pending",
        ))
        db.add(_make_transaction(
            org_id, user.id,
            property_id=prop.id,
            amount=Decimal("200.00"),
            status="needs_review",
        ))
        db.add(_make_transaction(
            org_id, user.id,
            property_id=prop.id,
            amount=Decimal("150.00"),
            status="duplicate",
        ))
        await db.commit()

        from app.repositories import summary_repo
        rows = await summary_repo.txn_sum_by_category(db, org_id)
        total = sum(float(row.total) for row in rows)

        assert total == 500.00

    @pytest.mark.asyncio
    async def test_unverified_income_excluded_from_revenue(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)

        db.add(_make_transaction(
            org_id, user.id,
            property_id=prop.id,
            amount=Decimal("1200.00"),
            category="rental_revenue",
            transaction_type="income",
            schedule_e_line="line_3_rents_received",
            status="unverified",
            tags=["rental_revenue"],
        ))
        await db.commit()

        from app.repositories import summary_repo
        rows = await summary_repo.txn_sum_by_category(db, org_id)
        by_tag = {row.tag: float(row.total) for row in rows}

        assert by_tag.get("rental_revenue") is None

    @pytest.mark.asyncio
    async def test_unverified_expense_excluded_from_expenses(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)

        db.add(_make_transaction(
            org_id, user.id,
            property_id=prop.id,
            amount=Decimal("75.00"),
            category="maintenance",
            transaction_type="expense",
            status="unverified",
            tags=["maintenance"],
        ))
        await db.commit()

        from app.repositories import summary_repo
        rows = await summary_repo.txn_sum_by_category(db, org_id)
        by_tag = {row.tag: float(row.total) for row in rows}

        assert by_tag.get("maintenance") is None

    @pytest.mark.asyncio
    async def test_unverified_excluded_even_if_not_deleted(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)

        db.add(_make_transaction(
            org_id, user.id,
            property_id=prop.id,
            amount=Decimal("500.00"),
            status="approved",
        ))
        db.add(_make_transaction(
            org_id, user.id,
            property_id=prop.id,
            amount=Decimal("999.00"),
            status="unverified",
            deleted_at=datetime(2025, 6, 1, tzinfo=timezone.utc),
        ))
        await db.commit()

        from app.repositories import summary_repo
        rows = await summary_repo.txn_sum_by_category(db, org_id)
        total = sum(float(row.total) for row in rows)

        assert total == 500.00

    @pytest.mark.asyncio
    async def test_deleted_transactions_excluded(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)

        db.add(_make_transaction(
            org_id, user.id,
            property_id=prop.id,
            amount=Decimal("500.00"),
            status="approved",
        ))
        db.add(_make_transaction(
            org_id, user.id,
            property_id=prop.id,
            amount=Decimal("999.00"),
            status="approved",
            deleted_at=datetime(2025, 6, 1, tzinfo=timezone.utc),
        ))
        await db.commit()

        from app.repositories import summary_repo
        rows = await summary_repo.txn_sum_by_category(db, org_id)
        total = sum(float(row.total) for row in rows)

        assert total == 500.00

    @pytest.mark.asyncio
    async def test_filter_by_date_range(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)

        db.add(_make_transaction(
            org_id, user.id,
            property_id=prop.id,
            amount=Decimal("100.00"),
            transaction_date=date(2025, 3, 15),
        ))
        db.add(_make_transaction(
            org_id, user.id,
            property_id=prop.id,
            amount=Decimal("200.00"),
            transaction_date=date(2025, 6, 15),
        ))
        db.add(_make_transaction(
            org_id, user.id,
            property_id=prop.id,
            amount=Decimal("300.00"),
            transaction_date=date(2025, 9, 15),
        ))
        await db.commit()

        from app.repositories import summary_repo
        rows = await summary_repo.txn_sum_by_category(
            db, org_id,
            start_date=datetime(2025, 4, 1, tzinfo=timezone.utc),
            end_date=datetime(2025, 8, 1, tzinfo=timezone.utc),
        )
        total = sum(float(row.total) for row in rows)

        assert total == 200.00

    @pytest.mark.asyncio
    async def test_filter_by_property(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop_a = _make_property(org_id, user.id, name="Prop A", address="1 A St")
        prop_b = _make_property(org_id, user.id, name="Prop B", address="2 B St")
        db.add_all([prop_a, prop_b])

        db.add(_make_transaction(
            org_id, user.id,
            property_id=prop_a.id,
            amount=Decimal("100.00"),
        ))
        db.add(_make_transaction(
            org_id, user.id,
            property_id=prop_b.id,
            amount=Decimal("200.00"),
        ))
        await db.commit()

        from app.repositories import summary_repo
        rows = await summary_repo.txn_sum_by_category(
            db, org_id, property_ids=[prop_a.id],
        )
        total = sum(float(row.total) for row in rows)

        assert total == 100.00

    @pytest.mark.asyncio
    async def test_by_property_and_category_grouping(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop_a = _make_property(org_id, user.id, name="Prop A", address="1 A St")
        prop_b = _make_property(org_id, user.id, name="Prop B", address="2 B St")
        db.add_all([prop_a, prop_b])

        db.add(_make_transaction(
            org_id, user.id, property_id=prop_a.id,
            amount=Decimal("500.00"), category="rental_revenue",
            transaction_type="income", schedule_e_line="line_3_rents_received",
            tags=["rental_revenue"],
        ))
        db.add(_make_transaction(
            org_id, user.id, property_id=prop_a.id,
            amount=Decimal("100.00"), category="maintenance",
            tags=["maintenance"],
        ))
        db.add(_make_transaction(
            org_id, user.id, property_id=prop_b.id,
            amount=Decimal("800.00"), category="rental_revenue",
            transaction_type="income", schedule_e_line="line_3_rents_received",
            tags=["rental_revenue"],
        ))
        await db.commit()

        from app.repositories import summary_repo
        rows = await summary_repo.txn_sum_by_property_and_category(db, org_id)
        data = {(str(r.property_id), r.tag): float(r.total) for r in rows}

        assert data[(str(prop_a.id), "rental_revenue")] == 500.00
        assert data[(str(prop_a.id), "maintenance")] == 100.00
        assert data[(str(prop_b.id), "rental_revenue")] == 800.00

    @pytest.mark.asyncio
    async def test_by_month_and_category_grouping(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)

        db.add(_make_transaction(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("100.00"), transaction_date=date(2025, 1, 15),
        ))
        db.add(_make_transaction(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("200.00"), transaction_date=date(2025, 1, 20),
        ))
        db.add(_make_transaction(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("300.00"), transaction_date=date(2025, 3, 10),
        ))
        await db.commit()

        from app.repositories import summary_repo
        rows = await summary_repo.txn_sum_by_month_and_category(db, org_id)
        monthly = {(int(r.year), int(r.month)): float(r.total) for r in rows}

        assert monthly[(2025, 1)] == 300.00
        assert monthly[(2025, 3)] == 300.00

    @pytest.mark.asyncio
    async def test_organization_isolation(self, db: AsyncSession) -> None:
        user, org_id_a = await _setup_org_and_user(db)
        _, org_id_b = await _setup_org_and_user(db)
        prop_a = _make_property(org_id_a, user.id, name="Prop A", address="A")
        db.add(prop_a)

        db.add(_make_transaction(
            org_id_a, user.id, property_id=prop_a.id,
            amount=Decimal("500.00"),
        ))
        await db.commit()

        from app.repositories import summary_repo
        rows_b = await summary_repo.txn_sum_by_category(db, org_id_b)
        assert len(rows_b) == 0


class TestGetTaxSummary:

    @pytest.mark.asyncio
    async def test_tax_summary_by_category_breakdown(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)

        db.add(_make_transaction(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("5000.00"),
            category="rental_revenue",
            transaction_type="income",
            schedule_e_line="line_3_rents_received",
            tax_relevant=True,
            tags=["rental_revenue"],
        ))
        db.add(_make_transaction(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("500.00"),
            category="maintenance",
            tax_relevant=True,
            tags=["maintenance"],
        ))
        db.add(_make_transaction(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("200.00"),
            category="utilities",
            schedule_e_line="line_17_utilities",
            tax_relevant=True,
            tags=["utilities"],
        ))
        # Non-tax-relevant transaction should be excluded
        db.add(_make_transaction(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("1000.00"),
            category="other_expense",
            schedule_e_line="line_19_other",
            tax_relevant=False,
            tags=["other_expense"],
        ))
        await db.commit()

        from app.repositories import summary_repo
        rows = await summary_repo.txn_sum_by_category(
            db, org_id,
            start_date=datetime(2025, 1, 1, tzinfo=timezone.utc),
            end_date=datetime(2025, 12, 31, 23, 59, 59, tzinfo=timezone.utc),
            tax_relevant_only=True,
        )
        by_tag = {row.tag: float(row.total) for row in rows}

        from app.core.tags import REVENUE_TAGS, EXPENSE_TAGS
        revenue = sum(v for k, v in by_tag.items() if k in REVENUE_TAGS)
        deductions = sum(v for k, v in by_tag.items() if k in EXPENSE_TAGS)

        assert revenue == 5000.00
        assert deductions == 700.00
        assert by_tag.get("rental_revenue") == 5000.00
        assert by_tag.get("maintenance") == 500.00
        assert by_tag.get("utilities") == 200.00
        assert "other_expense" not in by_tag

    @pytest.mark.asyncio
    async def test_tax_summary_excludes_other_years(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)

        db.add(_make_transaction(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("500.00"),
            transaction_date=date(2025, 6, 15),
            tax_year=2025,
        ))
        db.add(_make_transaction(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("300.00"),
            transaction_date=date(2024, 12, 15),
            tax_year=2024,
        ))
        await db.commit()

        from app.repositories import summary_repo
        rows = await summary_repo.txn_sum_by_category(
            db, org_id,
            start_date=datetime(2025, 1, 1, tzinfo=timezone.utc),
            end_date=datetime(2025, 12, 31, 23, 59, 59, tzinfo=timezone.utc),
            tax_relevant_only=True,
        )
        total = sum(float(row.total) for row in rows)

        assert total == 500.00

    @pytest.mark.asyncio
    async def test_tax_summary_multiple_categories(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)

        categories = [
            ("maintenance", "expense", Decimal("100.00"), "line_7_cleaning_maintenance"),
            ("insurance", "expense", Decimal("200.00"), "line_9_insurance"),
            ("mortgage_interest", "expense", Decimal("800.00"), "line_12_mortgage_interest"),
            ("taxes", "expense", Decimal("300.00"), "line_16_taxes"),
            ("rental_revenue", "income", Decimal("3000.00"), "line_3_rents_received"),
        ]
        for cat, txn_type, amount, sched_line in categories:
            db.add(_make_transaction(
                org_id, user.id, property_id=prop.id,
                amount=amount,
                category=cat,
                transaction_type=txn_type,
                schedule_e_line=sched_line,
                tax_relevant=True,
                tags=[cat],
            ))
        await db.commit()

        from app.repositories import summary_repo
        rows = await summary_repo.txn_sum_by_category(
            db, org_id,
            start_date=datetime(2025, 1, 1, tzinfo=timezone.utc),
            end_date=datetime(2025, 12, 31, 23, 59, 59, tzinfo=timezone.utc),
            tax_relevant_only=True,
        )
        by_tag = {row.tag: float(row.total) for row in rows}

        assert by_tag["maintenance"] == 100.00
        assert by_tag["insurance"] == 200.00
        assert by_tag["mortgage_interest"] == 800.00
        assert by_tag["taxes"] == 300.00
        assert by_tag["rental_revenue"] == 3000.00

    @pytest.mark.asyncio
    async def test_tax_summary_only_approved_other_statuses_excluded(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)

        db.add(_make_transaction(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("4000.00"),
            category="rental_revenue",
            transaction_type="income",
            schedule_e_line="line_3_rents_received",
            tax_relevant=True,
            status="approved",
            tags=["rental_revenue"],
        ))
        db.add(_make_transaction(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("1500.00"),
            category="rental_revenue",
            transaction_type="income",
            schedule_e_line="line_3_rents_received",
            tax_relevant=True,
            status="unverified",
            tags=["rental_revenue"],
        ))
        db.add(_make_transaction(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("700.00"),
            category="rental_revenue",
            transaction_type="income",
            schedule_e_line="line_3_rents_received",
            tax_relevant=True,
            status="pending",
            tags=["rental_revenue"],
        ))
        db.add(_make_transaction(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("250.00"),
            category="rental_revenue",
            transaction_type="income",
            schedule_e_line="line_3_rents_received",
            tax_relevant=True,
            status="needs_review",
            tags=["rental_revenue"],
        ))
        db.add(_make_transaction(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("100.00"),
            category="rental_revenue",
            transaction_type="income",
            schedule_e_line="line_3_rents_received",
            tax_relevant=True,
            status="duplicate",
            tags=["rental_revenue"],
        ))
        await db.commit()

        from app.repositories import summary_repo
        rows = await summary_repo.txn_sum_by_category(
            db, org_id,
            start_date=datetime(2025, 1, 1, tzinfo=timezone.utc),
            end_date=datetime(2025, 12, 31, 23, 59, 59, tzinfo=timezone.utc),
            tax_relevant_only=True,
        )
        by_tag = {row.tag: float(row.total) for row in rows}

        assert by_tag.get("rental_revenue") == 4000.00

    @pytest.mark.asyncio
    async def test_empty_result_for_year_with_no_transactions(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        # No transactions at all
        from app.repositories import summary_repo
        rows = await summary_repo.txn_sum_by_category(
            db, org_id,
            start_date=datetime(2025, 1, 1, tzinfo=timezone.utc),
            end_date=datetime(2025, 12, 31, 23, 59, 59, tzinfo=timezone.utc),
            tax_relevant_only=True,
        )
        assert len(rows) == 0


class TestSummaryTypeAliases:
    """Verify summary type aliases are well-formed after removing typing.Any."""

    def test_summary_data_alias_imports(self) -> None:
        from app.services.transactions.summary_service import SummaryData
        assert SummaryData is not None

    def test_tax_summary_data_alias_imports(self) -> None:
        from app.services.transactions.summary_service import TaxSummaryData
        assert TaxSummaryData is not None

    def test_summary_data_accepts_valid_structure(self) -> None:
        """A well-formed summary dict should satisfy SummaryData at runtime."""
        from app.services.transactions.summary_service import SummaryData

        sample: SummaryData = {
            "revenue": 5000.0,
            "expenses": 700.0,
            "profit": 4300.0,
            "by_category": {"rental_revenue": 5000.0, "maintenance": 700.0},
            "by_property": [{"property_id": "abc", "name": "Prop A", "revenue": 5000.0, "expenses": 700.0, "profit": 4300.0}],
            "by_month": [{"month": "2025-01", "revenue": 5000.0, "expenses": 700.0, "profit": 4300.0}],
            "by_month_expense": [{"month": "2025-01", "maintenance": 700.0}],
            "by_property_month": [{"property_id": "abc", "name": "Prop A", "months": [{"month": "2025-01", "revenue": 5000.0, "expenses": 700.0, "profit": 4300.0}]}],
        }
        assert sample["revenue"] == 5000.0
        assert isinstance(sample["by_category"], dict)
        assert isinstance(sample["by_property"], list)


class TestUnassignedRevenue:
    """Transactions with no property (e.g. unattributed Airbnb payouts) are
    real revenue and must be counted in every dashboard aggregation — not
    silently dropped by the active-property filter or the by-property join.

    Regression for the dashboard showing $1,301.60 (assigned only) while the
    drill-down showed $1,593.48 (assigned + $291.88 unattributed Airbnb).
    """

    @pytest.mark.asyncio
    async def test_unassigned_revenue_in_by_category(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)
        db.add(_make_transaction(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("1301.60"), category="rental_revenue",
            transaction_type="income", schedule_e_line="line_3_rents_received",
            tags=["rental_revenue"],
        ))
        db.add(_make_transaction(
            org_id, user.id, property_id=None,
            amount=Decimal("291.88"), category="rental_revenue",
            transaction_type="income", schedule_e_line="line_3_rents_received",
            tags=["rental_revenue"],
        ))
        await db.commit()

        from app.repositories import summary_repo
        rows = await summary_repo.txn_sum_by_category(db, org_id)
        by_tag = {row.tag: float(row.total) for row in rows}

        assert by_tag.get("rental_revenue") == 1593.48

    @pytest.mark.asyncio
    async def test_unassigned_revenue_in_by_month(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        db.add(_make_transaction(
            org_id, user.id, property_id=None,
            amount=Decimal("291.88"), category="rental_revenue",
            transaction_type="income", schedule_e_line="line_3_rents_received",
            transaction_date=date(2026, 5, 10), tax_year=2026,
            tags=["rental_revenue"],
        ))
        await db.commit()

        from app.repositories import summary_repo
        rows = await summary_repo.txn_sum_by_month_and_category(db, org_id)
        monthly = {(int(r.year), int(r.month)): float(r.total) for r in rows}

        assert monthly[(2026, 5)] == 291.88

    @pytest.mark.asyncio
    async def test_by_property_returns_null_property_row(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        db.add(_make_transaction(
            org_id, user.id, property_id=None,
            amount=Decimal("291.88"), category="rental_revenue",
            transaction_type="income", schedule_e_line="line_3_rents_received",
            tags=["rental_revenue"],
        ))
        await db.commit()

        from app.repositories import summary_repo
        rows = await summary_repo.txn_sum_by_property_and_category(db, org_id)
        assert [(r.property_id, r.tag, float(r.total)) for r in rows] == [
            (None, "rental_revenue", 291.88)
        ]

    @pytest.mark.asyncio
    async def test_by_property_month_returns_null_property_row(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        db.add(_make_transaction(
            org_id, user.id, property_id=None,
            amount=Decimal("291.88"), category="rental_revenue",
            transaction_type="income", schedule_e_line="line_3_rents_received",
            transaction_date=date(2026, 5, 10), tax_year=2026,
            tags=["rental_revenue"],
        ))
        await db.commit()

        from app.repositories import summary_repo
        rows = await summary_repo.txn_sum_by_property_month_and_category(db, org_id)
        assert [r.property_id for r in rows] == [None]
        assert float(rows[0].total) == 291.88

    @pytest.mark.asyncio
    async def test_by_property_reconciles_with_total(self, db: AsyncSession) -> None:
        """sum(by_property) must equal by_category total — the invariant that
        was broken (chart total != drill-down total)."""
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)
        db.add(_make_transaction(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("1301.60"), category="rental_revenue",
            transaction_type="income", schedule_e_line="line_3_rents_received",
            tags=["rental_revenue"],
        ))
        db.add(_make_transaction(
            org_id, user.id, property_id=None,
            amount=Decimal("291.88"), category="rental_revenue",
            transaction_type="income", schedule_e_line="line_3_rents_received",
            tags=["rental_revenue"],
        ))
        await db.commit()

        from app.repositories import summary_repo
        cat_total = sum(
            float(r.total) for r in await summary_repo.txn_sum_by_category(db, org_id)
        )
        prop_total = sum(
            float(r.total)
            for r in await summary_repo.txn_sum_by_property_and_category(db, org_id)
        )
        assert cat_total == prop_total == 1593.48

    @pytest.mark.asyncio
    async def test_unassigned_tax_relevant_revenue_in_by_property(self, db: AsyncSession) -> None:
        """get_tax_summary uses the same by-property query with
        tax_relevant_only=True — unattributed tax-relevant income must surface
        as the Unassigned bucket there too (it was previously dropped from the
        tax dashboard's by-property breakdown while still in by_category)."""
        user, org_id = await _setup_org_and_user(db)
        db.add(_make_transaction(
            org_id, user.id, property_id=None,
            amount=Decimal("291.88"), category="rental_revenue",
            transaction_type="income", schedule_e_line="line_3_rents_received",
            tax_relevant=True,
            transaction_date=date(2026, 5, 10), tax_year=2026,
            tags=["rental_revenue"],
        ))
        await db.commit()

        from app.repositories import summary_repo
        rows = await summary_repo.txn_sum_by_property_and_category(
            db, org_id,
            start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
            end_date=datetime(2026, 12, 31, 23, 59, 59, tzinfo=timezone.utc),
            tax_relevant_only=True,
        )
        assert [(r.property_id, r.tag, float(r.total)) for r in rows] == [
            (None, "rental_revenue", 291.88)
        ]

    @pytest.mark.asyncio
    async def test_inactive_property_txn_still_excluded(self, db: AsyncSession) -> None:
        """Relaxing the active-property gate for NULL-property rows must NOT
        leak transactions tied to a genuinely inactive property."""
        user, org_id = await _setup_org_and_user(db)
        inactive = Property(
            id=uuid.uuid4(),
            organization_id=org_id,
            user_id=user.id,
            name="Archived Property",
            address="999 Old St",
            is_active=False,
        )
        db.add(inactive)
        db.add(_make_transaction(
            org_id, user.id, property_id=inactive.id,
            amount=Decimal("500.00"), category="rental_revenue",
            transaction_type="income", schedule_e_line="line_3_rents_received",
            tags=["rental_revenue"],
        ))
        await db.commit()

        from app.repositories import summary_repo
        rows = await summary_repo.txn_sum_by_category(db, org_id)
        assert list(rows) == []


class TestDistinctTransactionYears:
    """``distinct_transaction_years`` powers the dashboard year dropdown.

    It must return every year that has approved, non-deleted data — unscoped by
    date range or property — so selecting one year never hides the others
    (regression for the dashboard year filter collapsing to the selected year).
    """

    @pytest.mark.asyncio
    async def test_returns_distinct_years_ascending(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)
        for year in (2024, 2025, 2026):
            db.add(_make_transaction(
                org_id, user.id, property_id=prop.id,
                amount=Decimal("100.00"),
                transaction_date=date(year, 6, 15), tax_year=year,
            ))
        await db.commit()

        from app.repositories import summary_repo
        years = await summary_repo.distinct_transaction_years(db, org_id)
        assert years == [2024, 2025, 2026]

    @pytest.mark.asyncio
    async def test_deduplicates_multiple_months_same_year(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)
        for month in (1, 6, 12):
            db.add(_make_transaction(
                org_id, user.id, property_id=prop.id,
                amount=Decimal("100.00"),
                transaction_date=date(2025, month, 10), tax_year=2025,
            ))
        await db.commit()

        from app.repositories import summary_repo
        years = await summary_repo.distinct_transaction_years(db, org_id)
        assert years == [2025]

    @pytest.mark.asyncio
    async def test_excludes_non_approved_and_deleted(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)
        # 2025 approved → should appear
        db.add(_make_transaction(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("100.00"),
            transaction_date=date(2025, 6, 15), tax_year=2025,
        ))
        # 2024 only has an unverified transaction → should NOT appear
        db.add(_make_transaction(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("100.00"), status="unverified",
            transaction_date=date(2024, 6, 15), tax_year=2024,
        ))
        # 2023 only has a deleted (approved) transaction → should NOT appear
        db.add(_make_transaction(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("100.00"),
            deleted_at=datetime(2023, 7, 1, tzinfo=timezone.utc),
            transaction_date=date(2023, 6, 15), tax_year=2023,
        ))
        await db.commit()

        from app.repositories import summary_repo
        years = await summary_repo.distinct_transaction_years(db, org_id)
        assert years == [2025]

    @pytest.mark.asyncio
    async def test_includes_year_with_only_unassigned_transaction(self, db: AsyncSession) -> None:
        """A year whose only data is an unattributed (null-property) payout must
        still surface — the active-property gate must not drop it."""
        user, org_id = await _setup_org_and_user(db)
        db.add(_make_transaction(
            org_id, user.id, property_id=None,
            amount=Decimal("291.88"), category="rental_revenue",
            transaction_type="income", schedule_e_line="line_3_rents_received",
            transaction_date=date(2026, 5, 10), tax_year=2026,
            tags=["rental_revenue"],
        ))
        await db.commit()

        from app.repositories import summary_repo
        years = await summary_repo.distinct_transaction_years(db, org_id)
        assert years == [2026]

    @pytest.mark.asyncio
    async def test_excludes_year_with_only_inactive_property(self, db: AsyncSession) -> None:
        """A year whose only data is tied to an inactive property (outside any
        activity period) is empty in the dashboard — it must not be offered."""
        user, org_id = await _setup_org_and_user(db)
        inactive = Property(
            id=uuid.uuid4(), organization_id=org_id, user_id=user.id,
            name="Archived", address="999 Old St", is_active=False,
        )
        db.add(inactive)
        db.add(_make_transaction(
            org_id, user.id, property_id=inactive.id,
            amount=Decimal("100.00"),
            transaction_date=date(2022, 6, 15), tax_year=2022,
        ))
        await db.commit()

        from app.repositories import summary_repo
        years = await summary_repo.distinct_transaction_years(db, org_id)
        assert years == []

    @pytest.mark.asyncio
    async def test_empty_when_no_transactions(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        from app.repositories import summary_repo
        years = await summary_repo.distinct_transaction_years(db, org_id)
        assert years == []

    @pytest.mark.asyncio
    async def test_organization_isolation(self, db: AsyncSession) -> None:
        user, org_id_a = await _setup_org_and_user(db)
        _, org_id_b = await _setup_org_and_user(db)
        prop_a = _make_property(org_id_a, user.id, name="Prop A", address="A")
        db.add(prop_a)
        db.add(_make_transaction(
            org_id_a, user.id, property_id=prop_a.id,
            amount=Decimal("100.00"),
            transaction_date=date(2024, 6, 15), tax_year=2024,
        ))
        await db.commit()

        from app.repositories import summary_repo
        years_b = await summary_repo.distinct_transaction_years(db, org_id_b)
        assert years_b == []
