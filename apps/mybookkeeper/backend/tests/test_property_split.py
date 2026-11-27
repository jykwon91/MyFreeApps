"""One transaction split across several properties.

Every per-property figure counts each property's share; every total across
properties is unchanged (no double counting); lists and checks treat a split
row as assigned.
"""
import uuid
from datetime import date
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction
from app.models.transactions.transaction_property_split import TransactionPropertySplit
from app.models.user.user import User
from app.repositories import transaction_repo, utility_trends_repo
from app.repositories.transactions import summary_repo, transaction_bulk_repo, transaction_list_repo
from app.services.transactions import property_pnl_service
from app.services.transactions.transaction_property_label import transaction_property_label

YEAR_START = date(2025, 1, 1)
YEAR_END = date(2025, 12, 31)


@pytest_asyncio.fixture()
async def owner(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(), email=f"split-{uuid.uuid4().hex[:8]}@example.com", hashed_password="x",
        is_active=True, is_superuser=False, is_verified=True,
    )
    db.add(user)
    await db.commit()
    return user


@pytest_asyncio.fixture()
async def org(db: AsyncSession, owner: User) -> Organization:
    org = Organization(id=uuid.uuid4(), name="Split Org", created_by=owner.id)
    db.add(org)
    await db.commit()
    return org


@pytest_asyncio.fixture()
async def houses(db: AsyncSession, org: Organization, owner: User) -> list[Property]:
    props = [
        Property(id=uuid.uuid4(), organization_id=org.id, user_id=owner.id, name=name, address=name)
        for name in ("6732 Peerless", "6734 Peerless", "6738 Peerless")
    ]
    db.add_all(props)
    await db.commit()
    return props


def _txn(
    org: Organization, owner: User, *, amount: str, property_id: uuid.UUID | None = None,
    category: str = "maintenance", transaction_type: str = "expense", status: str = "approved",
    schedule_e_line: str | None = "line_7_cleaning_maintenance",
) -> Transaction:
    return Transaction(
        id=uuid.uuid4(), organization_id=org.id, user_id=owner.id, property_id=property_id,
        transaction_date=date(2025, 6, 15), tax_year=2025, vendor="Zelle payment to Jason Law",
        amount=Decimal(amount), transaction_type=transaction_type, category=category, status=status,
        tax_relevant=True, schedule_e_line=schedule_e_line,
    )


async def _split(
    db: AsyncSession, txn: Transaction, shares: list[tuple[uuid.UUID | None, str]],
) -> Transaction:
    # Through the collection, as property_split_repo writes them.
    txn.property_splits = [
        TransactionPropertySplit(property_id=pid, amount=Decimal(amount)) for pid, amount in shares
    ]
    db.add(txn)
    await db.commit()
    return txn


async def _seed_lawn_care(
    db: AsyncSession, org: Organization, owner: User, houses: list[Property],
) -> Transaction:
    """$100.00 split three ways, plus an ordinary $50.00 for the first house."""
    a, b, c = houses
    db.add(_txn(org, owner, amount="50.00", property_id=a.id))
    return await _split(
        db, _txn(org, owner, amount="100.00"),
        [(a.id, "33.34"), (b.id, "33.33"), (c.id, "33.33")],
    )


def _by_property(rows: list, amount_field: str = "total") -> dict[uuid.UUID | None, Decimal]:
    totals: dict[uuid.UUID | None, Decimal] = {}
    for row in rows:
        totals[row.property_id] = totals.get(row.property_id, Decimal(0)) + Decimal(getattr(row, amount_field))
    return totals


class TestDashboardSummary:
    @pytest.mark.asyncio
    async def test_each_property_gets_its_share(self, db, org, owner, houses) -> None:
        await _seed_lawn_care(db, org, owner, houses)
        a, b, c = houses

        rows = await summary_repo.txn_sum_by_property_and_category(db, org.id)

        assert _by_property(rows) == {a.id: Decimal("83.34"), b.id: Decimal("33.33"), c.id: Decimal("33.33")}
        assert {row.property_name for row in rows} == {"6732 Peerless", "6734 Peerless", "6738 Peerless"}

    @pytest.mark.asyncio
    async def test_total_across_properties_is_unchanged(self, db, org, owner, houses) -> None:
        await _seed_lawn_care(db, org, owner, houses)

        rows = await summary_repo.txn_sum_by_category(db, org.id)

        assert sum(Decimal(row.total) for row in rows) == Decimal("150.00")

    @pytest.mark.asyncio
    async def test_property_filter_counts_only_that_share(self, db, org, owner, houses) -> None:
        await _seed_lawn_care(db, org, owner, houses)

        rows = await summary_repo.txn_sum_by_category(db, org.id, property_ids=[houses[1].id])
        monthly = await summary_repo.txn_sum_by_month_and_category(db, org.id, property_ids=[houses[1].id])

        assert [Decimal(row.total) for row in rows] == [Decimal("33.33")]
        assert [Decimal(row.total) for row in monthly] == [Decimal("33.33")]

    @pytest.mark.asyncio
    async def test_by_property_and_month_for_rental_roi(self, db, org, owner, houses) -> None:
        await _seed_lawn_care(db, org, owner, houses)

        rows = await summary_repo.txn_sum_by_property_month_and_category(db, org.id)

        assert _by_property(rows)[houses[2].id] == Decimal("33.33")
        assert sum(_by_property(rows).values()) == Decimal("150.00")

    @pytest.mark.asyncio
    async def test_years_with_data_lists_a_split_year_once(self, db, org, owner, houses) -> None:
        await _seed_lawn_care(db, org, owner, houses)

        assert await summary_repo.distinct_transaction_years(db, org.id) == [2025]


class TestPropertyPnl:
    @pytest.mark.asyncio
    async def test_each_property_gets_its_share(self, db, org, owner, houses) -> None:
        await _seed_lawn_care(db, org, owner, houses)

        pnl = await property_pnl_service._compute_pnl(db, org.id, since=YEAR_START, until=YEAR_END)

        expenses = {entry.property_id: entry.expenses_cents for entry in pnl.properties}
        assert expenses[houses[0].id] == 8_334
        assert expenses[houses[1].id] == 3_333
        assert expenses[houses[2].id] == 3_333
        assert pnl.total_expenses_cents == 15_000


class TestScheduleE:
    @pytest.mark.asyncio
    async def test_recompute_totals_per_property_line(self, db, org, owner, houses) -> None:
        await _seed_lawn_care(db, org, owner, houses)

        rows = await transaction_list_repo.sum_schedule_e_by_property_line(db, org.id, 2025)

        assert _by_property(rows) == {
            houses[0].id: Decimal("83.34"), houses[1].id: Decimal("33.33"), houses[2].id: Decimal("33.33"),
        }

    @pytest.mark.asyncio
    async def test_audit_trail_lists_each_share(self, db, org, owner, houses) -> None:
        split = await _seed_lawn_care(db, org, owner, houses)

        rows = await transaction_list_repo.list_schedule_e_transaction_details(db, org.id, 2025)

        shares = sorted((row.property_id, row.amount) for row in rows if row.id == split.id)
        assert shares == sorted([
            (houses[0].id, Decimal("33.34")), (houses[1].id, Decimal("33.33")), (houses[2].id, Decimal("33.33")),
        ])

    @pytest.mark.asyncio
    async def test_report_and_export_rows(self, db, org, owner, houses) -> None:
        await _seed_lawn_care(db, org, owner, houses)

        rows = await transaction_repo.schedule_e_report(db, org.id, 2025)

        assert _by_property(rows, "total_amount")[houses[1].id] == Decimal("33.33")
        assert sum(Decimal(row.total_amount) for row in rows) == Decimal("150.00")

    @pytest.mark.asyncio
    async def test_summary_by_property_and_checklist_property_ids(self, db, org, owner, houses) -> None:
        await _seed_lawn_care(db, org, owner, houses)

        rows = await transaction_repo.summary_by_property(db, org.id, tax_year=2025)
        property_ids = await transaction_repo.distinct_property_ids_by_category(db, org.id, 2025, "maintenance")

        assert _by_property(rows, "total_amount")[houses[2].id] == Decimal("33.33")
        assert set(property_ids) == {house.id for house in houses}


class TestUtilityTrends:
    @pytest.mark.asyncio
    async def test_split_bill_counts_per_property(self, db, org, owner, houses) -> None:
        await _split(
            db, _txn(org, owner, amount="90.00", category="utilities", schedule_e_line="line_17_utilities"),
            [(houses[0].id, "45.00"), (houses[1].id, "45.00")],
        )

        trends = await utility_trends_repo.get_utility_trends(db, org.id)
        summary = await utility_trends_repo.get_utility_summary(db, org.id, property_ids=[houses[0].id])

        assert _by_property(trends) == {houses[0].id: Decimal("45.00"), houses[1].id: Decimal("45.00")}
        assert [Decimal(row.total) for row in summary] == [Decimal("45.00")]


class TestDeletedProperty:
    @pytest.mark.asyncio
    async def test_share_of_a_deleted_property_stays_counted_as_unassigned(
        self, db, org, owner, houses,
    ) -> None:
        # What ON DELETE SET NULL leaves behind (SQLite here runs without FKs).
        await _split(db, _txn(org, owner, amount="100.00"), [(houses[0].id, "60.00"), (None, "40.00")])

        rows = await summary_repo.txn_sum_by_property_and_category(db, org.id)

        assert _by_property(rows) == {houses[0].id: Decimal("60.00"), None: Decimal("40.00")}


class TestListsTreatSplitAsAssigned:
    @pytest.mark.asyncio
    async def test_property_filter_finds_the_split_under_each_property(self, db, org, owner, houses) -> None:
        split = await _seed_lawn_care(db, org, owner, houses)

        for house in houses[1:]:
            rows = await transaction_repo.list_filtered(db, org.id, property_id=house.id)
            assert [row.id for row in rows] == [split.id]
        rows = await transaction_repo.list_filtered(db, org.id, property_ids=[houses[2].id])
        assert [row.id for row in rows] == [split.id]

    @pytest.mark.asyncio
    async def test_list_total_for_a_property_counts_only_its_share(self, db, org, owner, houses) -> None:
        await _seed_lawn_care(db, org, owner, houses)

        first = await transaction_repo.totals_filtered(db, org.id, property_id=houses[0].id)
        two = await transaction_repo.totals_filtered(db, org.id, property_ids=[houses[1].id, houses[2].id])
        everything = await transaction_repo.totals_filtered(db, org.id)

        assert (first.count, first.amount_total) == (2, Decimal("83.34"))
        assert (two.count, two.amount_total) == (1, Decimal("66.66"))
        assert (everything.count, everything.amount_total) == (2, Decimal("150.00"))

    @pytest.mark.asyncio
    async def test_unassigned_filter_leaves_the_split_out(self, db, org, owner, houses) -> None:
        await _seed_lawn_care(db, org, owner, houses)
        loose = _txn(org, owner, amount="5.00")
        db.add(loose)
        await db.commit()

        rows = await transaction_repo.list_filtered(db, org.id, unassigned=True)
        unassigned_for_tax = await transaction_repo.list_unassigned_tax_relevant(db, org.id, 2025)

        assert [row.id for row in rows] == [loose.id]
        assert [row.id for row in unassigned_for_tax] == [loose.id]

    @pytest.mark.asyncio
    async def test_listed_row_carries_its_shares(self, db, org, owner, houses) -> None:
        split = await _seed_lawn_care(db, org, owner, houses)

        rows = await transaction_repo.list_filtered(db, org.id, property_id=houses[0].id)
        row = next(r for r in rows if r.id == split.id)

        shares = [(s.property_id, s.amount) for s in row.property_splits]
        assert shares[0] == (houses[0].id, Decimal("33.34"))
        assert sorted(shares[1:]) == sorted([(houses[1].id, Decimal("33.33")), (houses[2].id, Decimal("33.33"))])

    @pytest.mark.asyncio
    async def test_selection_ref_says_split(self, db, org, owner, houses) -> None:
        split = await _seed_lawn_care(db, org, owner, houses)

        refs = {row.id: row for row in await transaction_repo.list_selection_refs(db, org.id)}

        assert refs[split.id].is_split is True
        assert refs[split.id].property_id is None

    @pytest.mark.asyncio
    async def test_bulk_approve_approves_a_split_row(self, db, org, owner, houses) -> None:
        split = await _split(
            db, _txn(org, owner, amount="10.00", status="pending"),
            [(houses[0].id, "5.00"), (houses[1].id, "5.00")],
        )
        unassigned = _txn(org, owner, amount="10.00", status="pending")
        db.add(unassigned)
        await db.commit()

        approved = await transaction_bulk_repo.bulk_approve(db, [split.id, unassigned.id], org.id)

        assert approved == 1
        await db.refresh(split)
        assert split.status == "approved"


class TestExportLabel:
    @pytest.mark.asyncio
    async def test_names_every_share_largest_first(self, db, org, owner, houses) -> None:
        split = await _seed_lawn_care(db, org, owner, houses)
        names = {house.id: house.name for house in houses}

        txn = await transaction_repo.get_by_id(db, split.id, org.id)

        label = transaction_property_label(txn, names)
        assert label.startswith("6732 Peerless $33.34; ")
        assert "6734 Peerless $33.33" in label and "6738 Peerless $33.33" in label

    def test_ordinary_row_is_its_property_name(self) -> None:
        pid = uuid.uuid4()
        txn = Transaction(property_id=pid, amount=Decimal("1.00"))
        txn.property_splits = []
        assert transaction_property_label(txn, {pid: "Oak"}) == "Oak"
