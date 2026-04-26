import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.properties.property import Property, PropertyType
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories import transaction_repo


async def _create_property(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, name: str = "Test Prop"
) -> Property:
    prop = Property(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        name=name,
        type=PropertyType.SHORT_TERM,
    )
    db.add(prop)
    await db.flush()
    return prop


def _make_transaction(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    property_id: uuid.UUID | None = None,
    vendor: str = "Test Vendor",
    amount: Decimal = Decimal("100.00"),
    transaction_date: date = date(2025, 6, 15),
    transaction_type: str = "expense",
    category: str = "maintenance",
    status: str = "pending",
    tax_relevant: bool = False,
    tax_year: int = 2025,
    schedule_e_line: str | None = None,
) -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        property_id=property_id,
        vendor=vendor,
        amount=amount,
        transaction_date=transaction_date,
        transaction_type=transaction_type,
        category=category,
        status=status,
        tax_relevant=tax_relevant,
        tax_year=tax_year,
        schedule_e_line=schedule_e_line,
    )


class TestCreate:
    @pytest.mark.asyncio
    async def test_creates_and_returns(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        txn = _make_transaction(test_org.id, test_user.id)
        result = await transaction_repo.create(db, txn)
        assert result.id is not None
        assert result.vendor == "Test Vendor"


class TestGetById:
    @pytest.mark.asyncio
    async def test_returns_transaction_scoped_to_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        txn = _make_transaction(test_org.id, test_user.id)
        await transaction_repo.create(db, txn)
        await db.commit()

        found = await transaction_repo.get_by_id(db, txn.id, test_org.id)
        assert found is not None
        assert found.id == txn.id

    @pytest.mark.asyncio
    async def test_returns_none_for_wrong_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        txn = _make_transaction(test_org.id, test_user.id)
        await transaction_repo.create(db, txn)
        await db.commit()

        found = await transaction_repo.get_by_id(db, txn.id, uuid.uuid4())
        assert found is None


class TestListFiltered:
    @pytest.mark.asyncio
    async def test_excludes_deleted(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        txn1 = _make_transaction(test_org.id, test_user.id, vendor="Active")
        txn2 = _make_transaction(test_org.id, test_user.id, vendor="Deleted")
        txn2.deleted_at = datetime.now(timezone.utc)
        await transaction_repo.create(db, txn1)
        await transaction_repo.create(db, txn2)
        await db.commit()

        results = await transaction_repo.list_filtered(db, test_org.id)
        vendors = [t.vendor for t in results]
        assert "Active" in vendors
        assert "Deleted" not in vendors

    @pytest.mark.asyncio
    async def test_filters_by_status(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        txn1 = _make_transaction(test_org.id, test_user.id, status="pending")
        txn2 = _make_transaction(test_org.id, test_user.id, status="approved")
        await transaction_repo.create(db, txn1)
        await transaction_repo.create(db, txn2)
        await db.commit()

        results = await transaction_repo.list_filtered(db, test_org.id, status="approved")
        assert len(results) == 1
        assert results[0].status == "approved"

    @pytest.mark.asyncio
    async def test_filters_by_property(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _create_property(db, test_org.id, test_user.id)
        txn1 = _make_transaction(test_org.id, test_user.id, property_id=prop.id)
        txn2 = _make_transaction(test_org.id, test_user.id)
        await transaction_repo.create(db, txn1)
        await transaction_repo.create(db, txn2)
        await db.commit()

        results = await transaction_repo.list_filtered(db, test_org.id, property_id=prop.id)
        assert len(results) == 1
        assert results[0].property_id == prop.id

    @pytest.mark.asyncio
    async def test_filters_by_date_range(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        txn1 = _make_transaction(test_org.id, test_user.id, transaction_date=date(2025, 1, 15))
        txn2 = _make_transaction(test_org.id, test_user.id, transaction_date=date(2025, 6, 15))
        await transaction_repo.create(db, txn1)
        await transaction_repo.create(db, txn2)
        await db.commit()

        results = await transaction_repo.list_filtered(
            db, test_org.id, start_date=date(2025, 3, 1), end_date=date(2025, 12, 31)
        )
        assert len(results) == 1
        assert results[0].transaction_date == date(2025, 6, 15)

    @pytest.mark.asyncio
    async def test_filters_by_tax_year(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        txn1 = _make_transaction(test_org.id, test_user.id, tax_year=2024)
        txn2 = _make_transaction(test_org.id, test_user.id, tax_year=2025)
        await transaction_repo.create(db, txn1)
        await transaction_repo.create(db, txn2)
        await db.commit()

        results = await transaction_repo.list_filtered(db, test_org.id, tax_year=2025)
        assert len(results) == 1
        assert results[0].tax_year == 2025

    @pytest.mark.asyncio
    async def test_pagination(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        for i in range(5):
            txn = _make_transaction(
                test_org.id, test_user.id,
                transaction_date=date(2025, 1, i + 1),
            )
            await transaction_repo.create(db, txn)
        await db.commit()

        results = await transaction_repo.list_filtered(db, test_org.id, limit=2, offset=1)
        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_scoped_to_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        txn = _make_transaction(test_org.id, test_user.id)
        await transaction_repo.create(db, txn)
        await db.commit()

        results = await transaction_repo.list_filtered(db, uuid.uuid4())
        assert len(results) == 0


class TestBulkApprove:
    @pytest.mark.asyncio
    async def test_approves_eligible(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _create_property(db, test_org.id, test_user.id)
        txn = _make_transaction(test_org.id, test_user.id, property_id=prop.id, status="pending")
        await transaction_repo.create(db, txn)
        await db.commit()

        count = await transaction_repo.bulk_approve(db, [txn.id], test_org.id)
        assert count == 1

    @pytest.mark.asyncio
    async def test_skips_without_property(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        txn = _make_transaction(test_org.id, test_user.id, status="pending")
        await transaction_repo.create(db, txn)
        await db.commit()

        count = await transaction_repo.bulk_approve(db, [txn.id], test_org.id)
        assert count == 0

    @pytest.mark.asyncio
    async def test_skips_wrong_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _create_property(db, test_org.id, test_user.id)
        txn = _make_transaction(test_org.id, test_user.id, property_id=prop.id, status="pending")
        await transaction_repo.create(db, txn)
        await db.commit()

        count = await transaction_repo.bulk_approve(db, [txn.id], uuid.uuid4())
        assert count == 0


class TestBulkDelete:
    @pytest.mark.asyncio
    async def test_soft_deletes(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        txn = _make_transaction(test_org.id, test_user.id)
        await transaction_repo.create(db, txn)
        await db.commit()

        count = await transaction_repo.bulk_delete(db, [txn.id], test_org.id)
        assert count == 1


class TestMarkDeleted:
    @pytest.mark.asyncio
    async def test_sets_deleted_at(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        txn = _make_transaction(test_org.id, test_user.id)
        await transaction_repo.create(db, txn)

        await transaction_repo.mark_deleted(db, txn)
        assert txn.deleted_at is not None
        assert txn.status == "duplicate"


class TestFindDuplicateByVendorDate:
    @pytest.mark.asyncio
    async def test_finds_duplicate(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        txn = _make_transaction(
            test_org.id, test_user.id,
            vendor="ACME Corp",
            transaction_date=date(2025, 3, 1),
        )
        await transaction_repo.create(db, txn)
        await db.commit()

        found = await transaction_repo.find_duplicate_by_vendor_date(
            db, test_org.id, "acme corp", date(2025, 3, 1)
        )
        assert found is not None
        assert found.id == txn.id

    @pytest.mark.asyncio
    async def test_returns_none_when_no_match(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        found = await transaction_repo.find_duplicate_by_vendor_date(
            db, test_org.id, "No Match", date(2025, 1, 1)
        )
        assert found is None

    @pytest.mark.asyncio
    async def test_excludes_specified_id(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        txn = _make_transaction(
            test_org.id, test_user.id,
            vendor="ACME Corp",
            transaction_date=date(2025, 3, 1),
        )
        await transaction_repo.create(db, txn)
        await db.commit()

        found = await transaction_repo.find_duplicate_by_vendor_date(
            db, test_org.id, "ACME Corp", date(2025, 3, 1), exclude_id=txn.id
        )
        assert found is None


class TestFindDuplicateByVendorDatePropertyScoping:
    """Regression tests for cross-property dedup false positives.

    Bug: when property_id was None, find_duplicate_by_vendor_date applied no
    property filter, matching Constellation transactions for 6732 Peerless when
    looking for 6738 Peerless bills (same vendor, same date, different property).
    """

    @pytest.mark.asyncio
    async def test_null_property_does_not_match_assigned_property(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """A new document with no property should NOT match an existing transaction on a specific property."""
        prop = await _create_property(db, test_org.id, test_user.id, "6732 Peerless St")
        txn = _make_transaction(
            test_org.id, test_user.id,
            vendor="Constellation",
            transaction_date=date(2025, 3, 18),
            amount=Decimal("92.18"),
            property_id=prop.id,
        )
        await transaction_repo.create(db, txn)
        await db.commit()

        found = await transaction_repo.find_duplicate_by_vendor_date(
            db, test_org.id, "Constellation", date(2025, 3, 18),
            property_id=None,
        )
        assert found is None, (
            "A search with property_id=None should not match transactions "
            "assigned to a specific property"
        )

    @pytest.mark.asyncio
    async def test_specific_property_matches_same_property(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """A new document with property_id=X should match an existing transaction on property X."""
        prop = await _create_property(db, test_org.id, test_user.id, "6738 Peerless St")
        txn = _make_transaction(
            test_org.id, test_user.id,
            vendor="Constellation",
            transaction_date=date(2025, 3, 18),
            amount=Decimal("92.18"),
            property_id=prop.id,
        )
        await transaction_repo.create(db, txn)
        await db.commit()

        found = await transaction_repo.find_duplicate_by_vendor_date(
            db, test_org.id, "Constellation", date(2025, 3, 18),
            property_id=prop.id,
        )
        assert found is not None
        assert found.id == txn.id

    @pytest.mark.asyncio
    async def test_specific_property_does_not_match_different_property(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """A new document for property A should NOT match a transaction on property B."""
        prop_a = await _create_property(db, test_org.id, test_user.id, "6732 Peerless St")
        prop_b = await _create_property(db, test_org.id, test_user.id, "6738 Peerless St")
        txn = _make_transaction(
            test_org.id, test_user.id,
            vendor="Constellation",
            transaction_date=date(2025, 3, 18),
            amount=Decimal("92.18"),
            property_id=prop_a.id,
        )
        await transaction_repo.create(db, txn)
        await db.commit()

        found = await transaction_repo.find_duplicate_by_vendor_date(
            db, test_org.id, "Constellation", date(2025, 3, 18),
            property_id=prop_b.id,
        )
        assert found is None, (
            "A search for property B should not match a transaction on property A"
        )

    @pytest.mark.asyncio
    async def test_specific_property_matches_null_property_transaction(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """A new document with property_id should match an existing unassigned transaction."""
        prop = await _create_property(db, test_org.id, test_user.id, "6738 Peerless St")
        txn = _make_transaction(
            test_org.id, test_user.id,
            vendor="Constellation",
            transaction_date=date(2025, 3, 18),
            amount=Decimal("92.18"),
            property_id=None,
        )
        await transaction_repo.create(db, txn)
        await db.commit()

        found = await transaction_repo.find_duplicate_by_vendor_date(
            db, test_org.id, "Constellation", date(2025, 3, 18),
            property_id=prop.id,
        )
        assert found is not None, (
            "A search with a specific property should also match unassigned transactions"
        )

    @pytest.mark.asyncio
    async def test_null_property_matches_null_property_transaction(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """A new document with no property should match an existing unassigned transaction."""
        txn = _make_transaction(
            test_org.id, test_user.id,
            vendor="Constellation",
            transaction_date=date(2025, 3, 18),
            amount=Decimal("92.18"),
            property_id=None,
        )
        await transaction_repo.create(db, txn)
        await db.commit()

        found = await transaction_repo.find_duplicate_by_vendor_date(
            db, test_org.id, "Constellation", date(2025, 3, 18),
            property_id=None,
        )
        assert found is not None, (
            "A search with no property should match other unassigned transactions"
        )


class TestSummaryByProperty:
    @pytest.mark.asyncio
    async def test_groups_by_property_and_type(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _create_property(db, test_org.id, test_user.id)
        txn1 = _make_transaction(
            test_org.id, test_user.id,
            property_id=prop.id,
            transaction_type="expense",
            category="maintenance",
            amount=Decimal("50.00"),
            status="approved",
        )
        txn2 = _make_transaction(
            test_org.id, test_user.id,
            property_id=prop.id,
            transaction_type="income",
            category="rental_revenue",
            amount=Decimal("200.00"),
            status="approved",
        )
        await transaction_repo.create(db, txn1)
        await transaction_repo.create(db, txn2)
        await db.commit()

        rows = await transaction_repo.summary_by_property(db, test_org.id)
        assert len(rows) == 2
        totals = {r.transaction_type: r.total_amount for r in rows}
        assert totals["expense"] == Decimal("50.00")
        assert totals["income"] == Decimal("200.00")

    @pytest.mark.asyncio
    async def test_excludes_non_approved(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _create_property(db, test_org.id, test_user.id)
        txn = _make_transaction(
            test_org.id, test_user.id,
            property_id=prop.id,
            status="pending",
        )
        await transaction_repo.create(db, txn)
        await db.commit()

        rows = await transaction_repo.summary_by_property(db, test_org.id)
        assert len(rows) == 0


class TestScheduleEReport:
    @pytest.mark.asyncio
    async def test_groups_by_property_and_line(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _create_property(db, test_org.id, test_user.id)
        txn = _make_transaction(
            test_org.id, test_user.id,
            property_id=prop.id,
            status="approved",
            tax_relevant=True,
            tax_year=2025,
            schedule_e_line="line_7_cleaning_maintenance",
            amount=Decimal("150.00"),
        )
        await transaction_repo.create(db, txn)
        await db.commit()

        rows = await transaction_repo.schedule_e_report(db, test_org.id, 2025)
        assert len(rows) == 1
        assert rows[0].total_amount == Decimal("150.00")
        assert rows[0].schedule_e_line == "line_7_cleaning_maintenance"

    @pytest.mark.asyncio
    async def test_excludes_non_tax_relevant(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _create_property(db, test_org.id, test_user.id)
        txn = _make_transaction(
            test_org.id, test_user.id,
            property_id=prop.id,
            status="approved",
            tax_relevant=False,
            tax_year=2025,
        )
        await transaction_repo.create(db, txn)
        await db.commit()

        rows = await transaction_repo.schedule_e_report(db, test_org.id, 2025)
        assert len(rows) == 0
