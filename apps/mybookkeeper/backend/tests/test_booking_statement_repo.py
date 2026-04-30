import uuid
from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.properties.property import Property, PropertyType
from app.models.transactions.booking_statement import BookingStatement
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories import booking_statement_repo


async def _create_property(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID
) -> Property:
    prop = Property(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        name="Test Prop",
        type=PropertyType.SHORT_TERM,
    )
    db.add(prop)
    await db.flush()
    return prop


async def _create_transaction(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID
) -> Transaction:
    txn = Transaction(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        vendor="Platform",
        amount=100,
        transaction_date=date(2025, 6, 1),
        transaction_type="income",
        category="rental_revenue",
        status="approved",
        tax_year=2025,
    )
    db.add(txn)
    await db.flush()
    return txn


def _make_booking_statement(
    org_id: uuid.UUID,
    *,
    property_id: uuid.UUID | None = None,
    transaction_id: uuid.UUID | None = None,
    res_code: str = "RES-001",
    check_in: date = date(2025, 6, 1),
    check_out: date = date(2025, 6, 5),
    net_booking_revenue: float | None = None,
) -> BookingStatement:
    return BookingStatement(
        id=uuid.uuid4(),
        organization_id=org_id,
        property_id=property_id,
        transaction_id=transaction_id,
        res_code=res_code,
        check_in=check_in,
        check_out=check_out,
        gross_booking=200,
        net_booking_revenue=net_booking_revenue,
    )


class TestCreate:
    @pytest.mark.asyncio
    async def test_creates_and_returns(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        bs = _make_booking_statement(test_org.id)
        result = await booking_statement_repo.create(db, bs)
        assert result.id is not None
        assert result.res_code == "RES-001"


class TestListByTransaction:
    @pytest.mark.asyncio
    async def test_returns_booking_statements_for_transaction(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        txn = await _create_transaction(db, test_org.id, test_user.id)
        bs1 = _make_booking_statement(
            test_org.id, transaction_id=txn.id,
            res_code="RES-A", check_in=date(2025, 6, 1), check_out=date(2025, 6, 3),
        )
        bs2 = _make_booking_statement(
            test_org.id, transaction_id=txn.id,
            res_code="RES-B", check_in=date(2025, 6, 5), check_out=date(2025, 6, 8),
        )
        await booking_statement_repo.create(db, bs1)
        await booking_statement_repo.create(db, bs2)
        await db.commit()

        results = await booking_statement_repo.list_by_transaction(db, txn.id)
        assert len(results) == 2
        assert results[0].check_in <= results[1].check_in

    @pytest.mark.asyncio
    async def test_returns_empty_for_no_booking_statements(
        self, db: AsyncSession
    ) -> None:
        results = await booking_statement_repo.list_by_transaction(db, uuid.uuid4())
        assert len(results) == 0


class TestFindByResCode:
    @pytest.mark.asyncio
    async def test_finds_by_code(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        bs = _make_booking_statement(test_org.id, res_code="UNIQUE-123")
        await booking_statement_repo.create(db, bs)
        await db.commit()

        found = await booking_statement_repo.find_by_res_code(db, test_org.id, "UNIQUE-123")
        assert found is not None
        assert found.res_code == "UNIQUE-123"

    @pytest.mark.asyncio
    async def test_returns_none_for_wrong_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        bs = _make_booking_statement(test_org.id, res_code="ORG-SCOPED")
        await booking_statement_repo.create(db, bs)
        await db.commit()

        found = await booking_statement_repo.find_by_res_code(db, uuid.uuid4(), "ORG-SCOPED")
        assert found is None

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(
        self, db: AsyncSession, test_org: Organization
    ) -> None:
        found = await booking_statement_repo.find_by_res_code(db, test_org.id, "NOPE")
        assert found is None


class TestListFiltered:
    @pytest.mark.asyncio
    async def test_filters_by_property(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _create_property(db, test_org.id, test_user.id)
        bs1 = _make_booking_statement(test_org.id, property_id=prop.id, res_code="WITH-PROP")
        bs2 = _make_booking_statement(test_org.id, res_code="NO-PROP")
        await booking_statement_repo.create(db, bs1)
        await booking_statement_repo.create(db, bs2)
        await db.commit()

        results = await booking_statement_repo.list_filtered(db, test_org.id, property_id=prop.id)
        assert len(results) == 1
        assert results[0].res_code == "WITH-PROP"

    @pytest.mark.asyncio
    async def test_filters_by_date_range(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        bs1 = _make_booking_statement(
            test_org.id, res_code="JAN",
            check_in=date(2025, 1, 10), check_out=date(2025, 1, 15),
        )
        bs2 = _make_booking_statement(
            test_org.id, res_code="JUL",
            check_in=date(2025, 7, 10), check_out=date(2025, 7, 15),
        )
        await booking_statement_repo.create(db, bs1)
        await booking_statement_repo.create(db, bs2)
        await db.commit()

        results = await booking_statement_repo.list_filtered(
            db, test_org.id, start_date=date(2025, 6, 1), end_date=date(2025, 12, 31)
        )
        assert len(results) == 1
        assert results[0].res_code == "JUL"

    @pytest.mark.asyncio
    async def test_pagination(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        for i in range(5):
            bs = _make_booking_statement(
                test_org.id, res_code=f"RES-{i}",
                check_in=date(2025, 1, i + 1), check_out=date(2025, 1, i + 5),
            )
            await booking_statement_repo.create(db, bs)
        await db.commit()

        results = await booking_statement_repo.list_filtered(db, test_org.id, limit=2, offset=1)
        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_scoped_to_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        bs = _make_booking_statement(test_org.id, res_code="SCOPED")
        await booking_statement_repo.create(db, bs)
        await db.commit()

        results = await booking_statement_repo.list_filtered(db, uuid.uuid4())
        assert len(results) == 0


class TestOccupancyQuery:
    @pytest.mark.asyncio
    async def test_returns_totals(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _create_property(db, test_org.id, test_user.id)
        bs1 = _make_booking_statement(
            test_org.id, property_id=prop.id, res_code="OCC-1",
            check_in=date(2025, 6, 1), check_out=date(2025, 6, 5),
        )
        bs2 = _make_booking_statement(
            test_org.id, property_id=prop.id, res_code="OCC-2",
            check_in=date(2025, 6, 10), check_out=date(2025, 6, 14),
        )
        await booking_statement_repo.create(db, bs1)
        await booking_statement_repo.create(db, bs2)
        await db.commit()

        row = await booking_statement_repo.occupancy_query(
            db, test_org.id, prop.id, date(2025, 6, 1), date(2025, 6, 30)
        )
        assert row is not None
        assert row.reservation_count == 2


class TestAdrQuery:
    @pytest.mark.asyncio
    async def test_returns_adr(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _create_property(db, test_org.id, test_user.id)
        bs = _make_booking_statement(
            test_org.id, property_id=prop.id, res_code="ADR-1",
            check_in=date(2025, 6, 1), check_out=date(2025, 6, 5),
            net_booking_revenue=400.00,
        )
        await booking_statement_repo.create(db, bs)
        await db.commit()

        row = await booking_statement_repo.adr_query(
            db, test_org.id, prop.id, date(2025, 6, 1), date(2025, 6, 30)
        )
        assert row is not None
