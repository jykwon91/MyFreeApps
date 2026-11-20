"""Deactivating a property hides it from pickers, not from history.

A rental sold in 2025 and deactivated still earned its 2024 rent and paid its 2024
repairs. The dashboard totals and charts, the year dropdown and the tax summary must
keep counting those approved transactions, and the tax summary must agree with
Schedule E, which never looked at the active flag.
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
from app.models.organization.organization import Organization
from app.models.properties.property import Property, PropertyType
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories import summary_repo, transaction_repo
from app.services.transactions import summary_service

_RENT_LINE = "line_3_rents_received"
_REPAIR_LINE = "line_7_cleaning_maintenance"
_SOLD_RENT_2024 = Decimal("2000.00")
_SOLD_REPAIR_2024 = Decimal("300.00")
_SOLD_RENT_2025 = Decimal("1500.00")
_KEPT_RENT_2025 = Decimal("1000.00")


def _session_factory(db: AsyncSession) -> Callable[[], AbstractAsyncContextManager[AsyncSession]]:
    @asynccontextmanager
    async def _fake() -> AsyncIterator[AsyncSession]:
        yield db

    return _fake


def _txn(
    org: Organization,
    user: User,
    prop: Property,
    *,
    amount: Decimal,
    on: date,
    category: str = "rental_revenue",
    transaction_type: str = "income",
    schedule_e_line: str = _RENT_LINE,
) -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        property_id=prop.id,
        transaction_date=on,
        tax_year=on.year,
        vendor=f"{category} {amount}",
        amount=amount,
        transaction_type=transaction_type,
        category=category,
        tags=[category],
        schedule_e_line=schedule_e_line,
        status="approved",
        tax_relevant=True,
    )


async def _seed(db: AsyncSession, org: Organization, user: User) -> tuple[Property, Property]:
    """A rental still owned, and one sold in mid-2025 and then deactivated."""
    kept = Property(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id,
        name="Kept House", type=PropertyType.LONG_TERM,
    )
    sold = Property(
        id=uuid.uuid4(), organization_id=org.id, user_id=user.id,
        name="Sold Condo", type=PropertyType.LONG_TERM, is_active=False,
    )
    db.add_all([kept, sold])
    await db.flush()
    db.add_all([
        _txn(org, user, sold, amount=_SOLD_RENT_2024, on=date(2024, 3, 10)),
        _txn(
            org, user, sold, amount=_SOLD_REPAIR_2024, on=date(2024, 4, 2),
            category="maintenance", transaction_type="expense", schedule_e_line=_REPAIR_LINE,
        ),
        _txn(org, user, sold, amount=_SOLD_RENT_2025, on=date(2025, 2, 15)),
        _txn(org, user, kept, amount=_KEPT_RENT_2025, on=date(2025, 6, 15)),
    ])
    await db.commit()
    return kept, sold


def _ctx(org: Organization, user: User) -> RequestContext:
    return RequestContext(organization_id=org.id, user_id=user.id, org_role="owner")


class TestDashboard:
    @pytest.mark.asyncio
    async def test_totals_and_property_breakdown_count_the_deactivated_property(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        _, sold = await _seed(db, test_org, test_user)

        with patch.object(summary_service, "AsyncSessionLocal", _session_factory(db)):
            summary = await summary_service.get_summary(_ctx(test_org, test_user))

        assert summary["revenue"] == float(_SOLD_RENT_2024 + _SOLD_RENT_2025 + _KEPT_RENT_2025)
        assert summary["expenses"] == float(_SOLD_REPAIR_2024)
        sold_row = next(row for row in summary["by_property"] if row["property_id"] == str(sold.id))
        assert sold_row["name"] == "Sold Condo"
        assert (sold_row["revenue"], sold_row["expenses"]) == (
            float(_SOLD_RENT_2024 + _SOLD_RENT_2025), float(_SOLD_REPAIR_2024),
        )

    @pytest.mark.asyncio
    async def test_monthly_charts_count_the_deactivated_property(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        _, sold = await _seed(db, test_org, test_user)

        with patch.object(summary_service, "AsyncSessionLocal", _session_factory(db)):
            summary = await summary_service.get_summary(_ctx(test_org, test_user))

        by_month = {row["month"]: (row["revenue"], row["expenses"]) for row in summary["by_month"]}
        assert by_month == {
            "2024-03": (float(_SOLD_RENT_2024), 0.0),
            "2024-04": (0.0, float(_SOLD_REPAIR_2024)),
            "2025-02": (float(_SOLD_RENT_2025), 0.0),
            "2025-06": (float(_KEPT_RENT_2025), 0.0),
        }
        sold_months = next(row for row in summary["by_property_month"] if row["property_id"] == str(sold.id))["months"]
        assert [m["month"] for m in sold_months] == ["2024-03", "2024-04", "2025-02"]

    @pytest.mark.asyncio
    async def test_year_list_offers_a_year_only_the_deactivated_property_has(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _seed(db, test_org, test_user)

        assert await summary_repo.distinct_transaction_years(db, test_org.id) == [2024, 2025]


class TestTaxSummary:
    @pytest.mark.asyncio
    async def test_a_past_year_counts_the_deactivated_property_and_matches_schedule_e(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        _, sold = await _seed(db, test_org, test_user)

        with patch.object(summary_service, "AsyncSessionLocal", _session_factory(db)):
            summary = await summary_service.get_tax_summary(_ctx(test_org, test_user), 2024)
        schedule_e = {
            (row.property_id, row.schedule_e_line): row.total
            for row in await transaction_repo.sum_schedule_e_by_property_line(db, test_org.id, 2024)
        }
        report = {
            (row.property_id, row.schedule_e_line): row.total_amount
            for row in await transaction_repo.schedule_e_report(db, test_org.id, 2024)
        }

        assert summary["gross_revenue"] == float(_SOLD_RENT_2024)
        assert summary["total_deductions"] == float(_SOLD_REPAIR_2024)
        assert summary["by_property"] == [{
            "property_id": str(sold.id),
            "name": "Sold Condo",
            "revenue": float(_SOLD_RENT_2024),
            "expenses": float(_SOLD_REPAIR_2024),
            "net_income": float(_SOLD_RENT_2024 - _SOLD_REPAIR_2024),
        }]
        assert schedule_e == report == {
            (sold.id, _RENT_LINE): _SOLD_RENT_2024,
            (sold.id, _REPAIR_LINE): _SOLD_REPAIR_2024,
        }
