import uuid
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.transactions.reconciliation_match import ReconciliationMatch
from app.models.transactions.reconciliation_source import ReconciliationSource
from app.models.transactions.reservation import Reservation
from app.models.user.user import User
from app.repositories import reconciliation_repo

from datetime import date


def _make_source(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    source_type: str = "1099_k",
    tax_year: int = 2025,
    reported_amount: Decimal = Decimal("10000.00"),
    status: str = "unmatched",
) -> ReconciliationSource:
    return ReconciliationSource(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        source_type=source_type,
        tax_year=tax_year,
        reported_amount=reported_amount,
        matched_amount=Decimal("0"),
        status=status,
    )


class TestCreateSource:
    @pytest.mark.asyncio
    async def test_creates_and_returns(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        source = _make_source(test_org.id, test_user.id)
        result = await reconciliation_repo.create_source(db, source)
        assert result.id is not None
        assert result.source_type == "1099_k"


class TestCreateMatch:
    @pytest.mark.asyncio
    async def test_creates_and_returns(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        source = _make_source(test_org.id, test_user.id)
        await reconciliation_repo.create_source(db, source)

        reservation = Reservation(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            res_code="MATCH-RES-1",
            check_in=date(2025, 6, 1),
            check_out=date(2025, 6, 5),
            gross_booking=Decimal("500.00"),
        )
        db.add(reservation)
        await db.flush()

        match = ReconciliationMatch(
            id=uuid.uuid4(),
            reconciliation_source_id=source.id,
            reservation_id=reservation.id,
            matched_amount=Decimal("500.00"),
        )
        result = await reconciliation_repo.create_match(db, match)
        assert result.id is not None
        assert result.matched_amount == Decimal("500.00")


class TestListSources:
    @pytest.mark.asyncio
    async def test_returns_sources_for_year(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        s1 = _make_source(test_org.id, test_user.id, tax_year=2025)
        s2 = _make_source(test_org.id, test_user.id, tax_year=2024)
        await reconciliation_repo.create_source(db, s1)
        await reconciliation_repo.create_source(db, s2)
        await db.commit()

        results = await reconciliation_repo.list_sources(db, test_org.id, 2025)
        assert len(results) == 1
        assert results[0].tax_year == 2025

    @pytest.mark.asyncio
    async def test_scoped_to_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        source = _make_source(test_org.id, test_user.id)
        await reconciliation_repo.create_source(db, source)
        await db.commit()

        results = await reconciliation_repo.list_sources(db, uuid.uuid4(), 2025)
        assert len(results) == 0


class TestGetSourceById:
    @pytest.mark.asyncio
    async def test_returns_source(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        source = _make_source(test_org.id, test_user.id)
        await reconciliation_repo.create_source(db, source)
        await db.commit()

        found = await reconciliation_repo.get_source_by_id(db, source.id, test_org.id)
        assert found is not None
        assert found.id == source.id

    @pytest.mark.asyncio
    async def test_returns_none_for_wrong_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        source = _make_source(test_org.id, test_user.id)
        await reconciliation_repo.create_source(db, source)
        await db.commit()

        found = await reconciliation_repo.get_source_by_id(db, source.id, uuid.uuid4())
        assert found is None


class TestGetDiscrepancies:
    @pytest.mark.asyncio
    async def test_excludes_matched(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        s1 = _make_source(test_org.id, test_user.id, status="unmatched")
        s2 = _make_source(test_org.id, test_user.id, status="matched")
        s3 = _make_source(test_org.id, test_user.id, status="partial")
        await reconciliation_repo.create_source(db, s1)
        await reconciliation_repo.create_source(db, s2)
        await reconciliation_repo.create_source(db, s3)
        await db.commit()

        results = await reconciliation_repo.get_discrepancies(db, test_org.id, 2025)
        statuses = [r.status for r in results]
        assert "matched" not in statuses
        assert len(results) == 2


class TestUpdateMatchedAmount:
    @pytest.mark.asyncio
    async def test_sets_matched_when_equal(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        source = _make_source(test_org.id, test_user.id, reported_amount=Decimal("1000.00"))
        await reconciliation_repo.create_source(db, source)

        await reconciliation_repo.update_matched_amount(db, source, Decimal("1000.00"))
        assert source.status == "matched"
        assert source.matched_amount == Decimal("1000.00")

    @pytest.mark.asyncio
    async def test_sets_partial_when_partial(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        source = _make_source(test_org.id, test_user.id, reported_amount=Decimal("1000.00"))
        await reconciliation_repo.create_source(db, source)

        await reconciliation_repo.update_matched_amount(db, source, Decimal("500.00"))
        assert source.status == "partial"

    @pytest.mark.asyncio
    async def test_sets_unmatched_when_zero(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        source = _make_source(test_org.id, test_user.id, reported_amount=Decimal("1000.00"))
        await reconciliation_repo.create_source(db, source)

        await reconciliation_repo.update_matched_amount(db, source, Decimal("0"))
        assert source.status == "unmatched"
