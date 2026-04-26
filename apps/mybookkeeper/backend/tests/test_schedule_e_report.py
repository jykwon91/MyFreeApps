"""Tests for the Schedule E report query.

Creates transactions with different categories and properties, then verifies
that schedule_e_report() correctly groups by property + schedule_e_line,
includes only approved + tax_relevant transactions, and sums amounts correctly.
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories import transaction_repo


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


def _make_txn(
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
        vendor="Test Vendor",
        tags=tags or [category],
    )


class TestScheduleEReport:

    @pytest.mark.asyncio
    async def test_groups_by_property_and_schedule_e_line(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop_a = _make_property(org_id, user.id, name="Prop A", address="1 A St")
        prop_b = _make_property(org_id, user.id, name="Prop B", address="2 B St")
        db.add_all([prop_a, prop_b])

        # Prop A: maintenance and insurance
        db.add(_make_txn(
            org_id, user.id, property_id=prop_a.id,
            amount=Decimal("100.00"),
            category="maintenance",
            schedule_e_line="line_7_cleaning_maintenance",
        ))
        db.add(_make_txn(
            org_id, user.id, property_id=prop_a.id,
            amount=Decimal("200.00"),
            category="insurance",
            schedule_e_line="line_9_insurance",
        ))
        # Prop B: maintenance
        db.add(_make_txn(
            org_id, user.id, property_id=prop_b.id,
            amount=Decimal("300.00"),
            category="maintenance",
            schedule_e_line="line_7_cleaning_maintenance",
        ))
        await db.commit()

        rows = await transaction_repo.schedule_e_report(db, org_id, 2025)

        data = {(str(r.property_id), r.schedule_e_line): float(r.total_amount) for r in rows}
        assert data[(str(prop_a.id), "line_7_cleaning_maintenance")] == 100.00
        assert data[(str(prop_a.id), "line_9_insurance")] == 200.00
        assert data[(str(prop_b.id), "line_7_cleaning_maintenance")] == 300.00
        assert len(data) == 3

    @pytest.mark.asyncio
    async def test_sums_multiple_transactions_same_line(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)

        db.add(_make_txn(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("150.00"),
        ))
        db.add(_make_txn(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("250.00"),
        ))
        db.add(_make_txn(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("100.00"),
        ))
        await db.commit()

        rows = await transaction_repo.schedule_e_report(db, org_id, 2025)
        assert len(rows) == 1
        assert float(rows[0].total_amount) == 500.00

    @pytest.mark.asyncio
    async def test_only_approved_transactions_included(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)

        db.add(_make_txn(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("500.00"),
            status="approved",
        ))
        db.add(_make_txn(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("300.00"),
            status="pending",
        ))
        db.add(_make_txn(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("200.00"),
            status="needs_review",
        ))
        await db.commit()

        rows = await transaction_repo.schedule_e_report(db, org_id, 2025)
        total = sum(float(r.total_amount) for r in rows)
        assert total == 500.00

    @pytest.mark.asyncio
    async def test_only_tax_relevant_transactions_included(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)

        db.add(_make_txn(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("500.00"),
            tax_relevant=True,
        ))
        db.add(_make_txn(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("300.00"),
            tax_relevant=False,
            category="other_expense",
            schedule_e_line="line_19_other",
            tags=["other_expense"],
        ))
        await db.commit()

        rows = await transaction_repo.schedule_e_report(db, org_id, 2025)
        total = sum(float(r.total_amount) for r in rows)
        assert total == 500.00

    @pytest.mark.asyncio
    async def test_deleted_transactions_excluded(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)

        db.add(_make_txn(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("500.00"),
        ))
        db.add(_make_txn(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("999.00"),
            deleted_at=datetime(2025, 6, 1, tzinfo=timezone.utc),
        ))
        await db.commit()

        rows = await transaction_repo.schedule_e_report(db, org_id, 2025)
        total = sum(float(r.total_amount) for r in rows)
        assert total == 500.00

    @pytest.mark.asyncio
    async def test_filters_by_tax_year(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)

        db.add(_make_txn(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("500.00"),
            tax_year=2025,
            transaction_date=date(2025, 6, 15),
        ))
        db.add(_make_txn(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("300.00"),
            tax_year=2024,
            transaction_date=date(2024, 12, 15),
        ))
        await db.commit()

        rows_2025 = await transaction_repo.schedule_e_report(db, org_id, 2025)
        total_2025 = sum(float(r.total_amount) for r in rows_2025)
        assert total_2025 == 500.00

        rows_2024 = await transaction_repo.schedule_e_report(db, org_id, 2024)
        total_2024 = sum(float(r.total_amount) for r in rows_2024)
        assert total_2024 == 300.00

    @pytest.mark.asyncio
    async def test_includes_both_income_and_expense(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)

        db.add(_make_txn(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("3000.00"),
            category="rental_revenue",
            transaction_type="income",
            schedule_e_line="line_3_rents_received",
            tags=["rental_revenue"],
        ))
        db.add(_make_txn(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("500.00"),
            category="maintenance",
            schedule_e_line="line_7_cleaning_maintenance",
        ))
        db.add(_make_txn(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("200.00"),
            category="utilities",
            schedule_e_line="line_17_utilities",
            tags=["utilities"],
        ))
        await db.commit()

        rows = await transaction_repo.schedule_e_report(db, org_id, 2025)
        data = {r.schedule_e_line: float(r.total_amount) for r in rows}

        assert data["line_3_rents_received"] == 3000.00
        assert data["line_7_cleaning_maintenance"] == 500.00
        assert data["line_17_utilities"] == 200.00

    @pytest.mark.asyncio
    async def test_null_schedule_e_line_excluded_from_grouping(self, db: AsyncSession) -> None:
        """Transactions with null schedule_e_line (e.g. uncategorized) still appear in the report
        but grouped under None."""
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)

        db.add(_make_txn(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("100.00"),
            category="uncategorized",
            schedule_e_line=None,
            tags=["uncategorized"],
        ))
        db.add(_make_txn(
            org_id, user.id, property_id=prop.id,
            amount=Decimal("500.00"),
            category="maintenance",
            schedule_e_line="line_7_cleaning_maintenance",
        ))
        await db.commit()

        rows = await transaction_repo.schedule_e_report(db, org_id, 2025)
        data = {r.schedule_e_line: float(r.total_amount) for r in rows}

        assert data.get("line_7_cleaning_maintenance") == 500.00
        assert data.get(None) == 100.00

    @pytest.mark.asyncio
    async def test_empty_report_for_year_with_no_transactions(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        rows = await transaction_repo.schedule_e_report(db, org_id, 2025)
        assert len(rows) == 0

    @pytest.mark.asyncio
    async def test_organization_isolation(self, db: AsyncSession) -> None:
        user_a, org_id_a = await _setup_org_and_user(db)
        user_b, org_id_b = await _setup_org_and_user(db)
        prop_a = _make_property(org_id_a, user_a.id, name="Prop A")
        prop_b = _make_property(org_id_b, user_b.id, name="Prop B")
        db.add_all([prop_a, prop_b])

        db.add(_make_txn(
            org_id_a, user_a.id, property_id=prop_a.id,
            amount=Decimal("500.00"),
        ))
        db.add(_make_txn(
            org_id_b, user_b.id, property_id=prop_b.id,
            amount=Decimal("300.00"),
        ))
        await db.commit()

        rows_a = await transaction_repo.schedule_e_report(db, org_id_a, 2025)
        total_a = sum(float(r.total_amount) for r in rows_a)
        assert total_a == 500.00

        rows_b = await transaction_repo.schedule_e_report(db, org_id_b, 2025)
        total_b = sum(float(r.total_amount) for r in rows_b)
        assert total_b == 300.00

    @pytest.mark.asyncio
    async def test_all_schedule_e_lines_present(self, db: AsyncSession) -> None:
        """Verify the report covers all standard Schedule E lines."""
        user, org_id = await _setup_org_and_user(db)
        prop = _make_property(org_id, user.id)
        db.add(prop)

        schedule_e_entries = [
            ("rental_revenue", "income", "line_3_rents_received"),
            ("advertising", "expense", "line_5_advertising"),
            ("travel", "expense", "line_6_auto_travel"),
            ("maintenance", "expense", "line_7_cleaning_maintenance"),
            ("management_fee", "expense", "line_8_commissions"),
            ("insurance", "expense", "line_9_insurance"),
            ("legal_professional", "expense", "line_10_legal_professional"),
            ("mortgage_interest", "expense", "line_12_mortgage_interest"),
            ("contract_work", "expense", "line_14_repairs"),
            ("taxes", "expense", "line_16_taxes"),
            ("utilities", "expense", "line_17_utilities"),
            ("other_expense", "expense", "line_19_other"),
        ]

        for cat, txn_type, sched_line in schedule_e_entries:
            db.add(_make_txn(
                org_id, user.id, property_id=prop.id,
                amount=Decimal("100.00"),
                category=cat,
                transaction_type=txn_type,
                schedule_e_line=sched_line,
                tags=[cat],
            ))
        await db.commit()

        rows = await transaction_repo.schedule_e_report(db, org_id, 2025)
        lines = {r.schedule_e_line for r in rows}

        expected_lines = {entry[2] for entry in schedule_e_entries}
        assert lines == expected_lines

    @pytest.mark.asyncio
    async def test_multiple_properties_correct_per_property_totals(self, db: AsyncSession) -> None:
        user, org_id = await _setup_org_and_user(db)
        prop_a = _make_property(org_id, user.id, name="Cabin", address="100 Mountain Rd")
        prop_b = _make_property(org_id, user.id, name="Beach House", address="200 Ocean Ave")
        prop_c = _make_property(org_id, user.id, name="City Apt", address="300 Downtown St")
        db.add_all([prop_a, prop_b, prop_c])

        # Prop A: revenue + maintenance
        db.add(_make_txn(
            org_id, user.id, property_id=prop_a.id,
            amount=Decimal("2000.00"),
            category="rental_revenue", transaction_type="income",
            schedule_e_line="line_3_rents_received",
            tags=["rental_revenue"],
        ))
        db.add(_make_txn(
            org_id, user.id, property_id=prop_a.id,
            amount=Decimal("300.00"),
            category="maintenance",
            schedule_e_line="line_7_cleaning_maintenance",
        ))

        # Prop B: revenue + insurance + maintenance
        db.add(_make_txn(
            org_id, user.id, property_id=prop_b.id,
            amount=Decimal("4000.00"),
            category="rental_revenue", transaction_type="income",
            schedule_e_line="line_3_rents_received",
            tags=["rental_revenue"],
        ))
        db.add(_make_txn(
            org_id, user.id, property_id=prop_b.id,
            amount=Decimal("600.00"),
            category="insurance",
            schedule_e_line="line_9_insurance",
            tags=["insurance"],
        ))
        db.add(_make_txn(
            org_id, user.id, property_id=prop_b.id,
            amount=Decimal("150.00"),
            category="maintenance",
            schedule_e_line="line_7_cleaning_maintenance",
        ))

        # Prop C: only revenue
        db.add(_make_txn(
            org_id, user.id, property_id=prop_c.id,
            amount=Decimal("1500.00"),
            category="rental_revenue", transaction_type="income",
            schedule_e_line="line_3_rents_received",
            tags=["rental_revenue"],
        ))
        await db.commit()

        rows = await transaction_repo.schedule_e_report(db, org_id, 2025)
        data = {(str(r.property_id), r.schedule_e_line): float(r.total_amount) for r in rows}

        assert data[(str(prop_a.id), "line_3_rents_received")] == 2000.00
        assert data[(str(prop_a.id), "line_7_cleaning_maintenance")] == 300.00
        assert data[(str(prop_b.id), "line_3_rents_received")] == 4000.00
        assert data[(str(prop_b.id), "line_9_insurance")] == 600.00
        assert data[(str(prop_b.id), "line_7_cleaning_maintenance")] == 150.00
        assert data[(str(prop_c.id), "line_3_rents_received")] == 1500.00
        assert len(data) == 6
