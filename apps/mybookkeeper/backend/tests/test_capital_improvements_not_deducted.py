"""A capital improvement is depreciated, not deducted in the year it's paid.

A $15,000 roof filed as maintenance with ``is_capital_improvement=True`` must stay off
every Schedule E / Schedule C line and out of the tax summary's deductions, while the
dashboard keeps counting it as money spent.
"""
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.models.organization.activity import Activity
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories import transaction_repo
from app.services.transactions import summary_service

_ROOF = Decimal("15000.00")
_REPAIR = Decimal("400.00")
_RENT = Decimal("3000.00")
_LINE_7 = "line_7_cleaning_maintenance"


def _session_factory(db: AsyncSession) -> Callable[[], AbstractAsyncContextManager[AsyncSession]]:
    @asynccontextmanager
    async def _fake() -> AsyncIterator[AsyncSession]:
        yield db

    return _fake


def _txn(
    org: Organization,
    user: User,
    *,
    amount: Decimal,
    property_id: uuid.UUID | None = None,
    activity_id: uuid.UUID | None = None,
    category: str = "maintenance",
    transaction_type: str = "expense",
    schedule_e_line: str | None = _LINE_7,
    is_capital_improvement: bool = False,
) -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        property_id=property_id,
        activity_id=activity_id,
        transaction_date=date(2025, 6, 15),
        tax_year=2025,
        vendor="Ace Roofing",
        amount=amount,
        transaction_type=transaction_type,
        category=category,
        tags=[category],
        schedule_e_line=schedule_e_line,
        status="approved",
        tax_relevant=True,
        is_capital_improvement=is_capital_improvement,
        placed_in_service_date=date(2025, 6, 15) if is_capital_improvement else None,
    )


async def _seed_rental(db: AsyncSession, org: Organization, user: User) -> Property:
    """A rental with one month's rent, a $400 repair and a $15,000 capital-improvement roof."""
    prop = Property(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id,
        name="Duplex", address="1 Main St",
    )
    db.add(prop)
    await db.flush()
    db.add_all([
        _txn(
            org, user, amount=_RENT, property_id=prop.id, category="rental_revenue",
            transaction_type="income", schedule_e_line="line_3_rents_received",
        ),
        _txn(org, user, amount=_REPAIR, property_id=prop.id),
        _txn(org, user, amount=_ROOF, property_id=prop.id, is_capital_improvement=True),
    ])
    await db.commit()
    return prop


def _ctx(org: Organization, user: User) -> RequestContext:
    return RequestContext(organization_id=org.id, user_id=user.id, org_role="owner")


class TestScheduleE:
    @pytest.mark.asyncio
    async def test_report_line_leaves_out_the_capital_improvement(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_rental(db, test_org, test_user)

        rows = await transaction_repo.schedule_e_report(db, test_org.id, 2025)

        by_line = {(r.property_id, r.schedule_e_line): r.total_amount for r in rows}
        assert by_line[(prop.id, _LINE_7)] == _REPAIR
        assert by_line[(prop.id, "line_3_rents_received")] == _RENT

    @pytest.mark.asyncio
    async def test_recompute_line_leaves_out_the_capital_improvement(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_rental(db, test_org, test_user)

        rows = await transaction_repo.sum_schedule_e_by_property_line(db, test_org.id, 2025)

        by_line = {(r.property_id, r.schedule_e_line): r.total for r in rows}
        assert by_line[(prop.id, _LINE_7)] == _REPAIR

    @pytest.mark.asyncio
    async def test_audit_trail_leaves_out_the_capital_improvement(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _seed_rental(db, test_org, test_user)

        rows = await transaction_repo.list_schedule_e_transaction_details(db, test_org.id, 2025)

        assert sorted(r.amount for r in rows) == [_REPAIR, _RENT]


class TestScheduleC:
    @pytest.mark.asyncio
    async def test_activity_rows_leave_out_the_capital_improvement(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        activity = Activity(
            id=uuid.uuid4(), organization_id=test_org.id, label="Consulting",
            activity_type="self_employment", tax_form="schedule_c",
        )
        db.add(activity)
        await db.flush()
        db.add_all([
            _txn(test_org, test_user, amount=_REPAIR, activity_id=activity.id, schedule_e_line=None),
            _txn(
                test_org, test_user, amount=_ROOF, activity_id=activity.id,
                schedule_e_line=None, is_capital_improvement=True,
            ),
        ])
        await db.commit()

        rows = await transaction_repo.list_by_activity_ids(db, test_org.id, 2025, [activity.id])

        assert [r.amount for r in rows] == [_REPAIR]


class TestTaxSummary:
    @pytest.mark.asyncio
    async def test_deductions_leave_out_the_capital_improvement(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _seed_rental(db, test_org, test_user)

        with patch.object(summary_service, "AsyncSessionLocal", _session_factory(db)):
            summary = await summary_service.get_tax_summary(_ctx(test_org, test_user), 2025)

        assert summary["total_deductions"] == float(_REPAIR)
        assert summary["net_taxable_income"] == float(_RENT - _REPAIR)
        assert summary["by_category"] == {"rental_revenue": float(_RENT), "maintenance": float(_REPAIR)}
        assert [p["expenses"] for p in summary["by_property"]] == [float(_REPAIR)]


class TestDashboard:
    @pytest.mark.asyncio
    async def test_expenses_still_count_the_capital_improvement_as_money_spent(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _seed_rental(db, test_org, test_user)

        with patch.object(summary_service, "AsyncSessionLocal", _session_factory(db)):
            summary = await summary_service.get_summary(_ctx(test_org, test_user))

        assert summary["expenses"] == float(_REPAIR + _ROOF)
        assert summary["by_category"]["maintenance"] == float(_REPAIR + _ROOF)
