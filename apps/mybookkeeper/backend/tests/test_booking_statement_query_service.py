"""Tests for booking_statement_query_service."""
import uuid
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.models.organization.organization import Organization
from app.models.properties.property import Property, PropertyType
from app.models.transactions.booking_statement import BookingStatement
from app.models.user.user import User
from app.repositories import booking_statement_repo
from app.services.transactions import booking_statement_query_service


def _make_ctx(org: Organization, user: User) -> RequestContext:
    return RequestContext(
        organization_id=org.id,
        user_id=user.id,
        org_role="owner",
    )


async def _seed_booking_statement(
    db: AsyncSession,
    org: Organization,
    prop: Property,
    *,
    res_code: str = "SVC-RES-001",
    check_in: date = date(2025, 6, 1),
    check_out: date = date(2025, 6, 5),
) -> BookingStatement:
    bs = BookingStatement(
        id=uuid.uuid4(),
        organization_id=org.id,
        property_id=prop.id,
        res_code=res_code,
        check_in=check_in,
        check_out=check_out,
        gross_booking=Decimal("500.00"),
        platform="airbnb",
    )
    await booking_statement_repo.create(db, bs)
    await db.commit()
    await db.refresh(bs)
    return bs


class TestListBookingStatements:
    @pytest.mark.asyncio
    async def test_lists(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = Property(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Svc Test Prop",
            type=PropertyType.SHORT_TERM,
        )
        db.add(prop)
        await db.flush()

        await _seed_booking_statement(db, test_org, prop)
        ctx = _make_ctx(test_org, test_user)

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.transactions.booking_statement_query_service.AsyncSessionLocal", _fake):
            results = await booking_statement_query_service.list_booking_statements(ctx)
        assert len(results) >= 1

    @pytest.mark.asyncio
    async def test_empty_when_none(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        ctx = _make_ctx(test_org, test_user)

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.transactions.booking_statement_query_service.AsyncSessionLocal", _fake):
            results = await booking_statement_query_service.list_booking_statements(ctx)
        assert len(results) == 0


class TestGetOccupancy:
    @pytest.mark.asyncio
    async def test_returns_occupancy(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = Property(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Occ Test Prop",
            type=PropertyType.SHORT_TERM,
        )
        db.add(prop)
        await db.flush()

        await _seed_booking_statement(db, test_org, prop)
        ctx = _make_ctx(test_org, test_user)

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.transactions.booking_statement_query_service.AsyncSessionLocal", _fake):
            result = await booking_statement_query_service.get_occupancy(
                ctx, prop.id, date(2025, 1, 1), date(2025, 12, 31),
            )
        assert "reservation_count" in result
        assert "total_days" in result
        assert "occupancy_rate" in result

    @pytest.mark.asyncio
    async def test_zero_when_no_booking_statements(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = Property(
            id=uuid.uuid4(),
            organization_id=test_org.id,
            user_id=test_user.id,
            name="Empty Prop",
            type=PropertyType.SHORT_TERM,
        )
        db.add(prop)
        await db.flush()
        await db.commit()

        ctx = _make_ctx(test_org, test_user)

        @asynccontextmanager
        async def _fake():
            yield db

        with patch("app.services.transactions.booking_statement_query_service.AsyncSessionLocal", _fake):
            result = await booking_statement_query_service.get_occupancy(
                ctx, prop.id, date(2025, 1, 1), date(2025, 12, 31),
            )
        assert result["total_nights"] == 0
        assert result["occupancy_rate"] == Decimal("0")
