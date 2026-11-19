"""A drill-down's total (GET /transactions/page's amount_total) equals the dashboard figure that was tapped.

The drill-down asks the list for the rows behind a summary number with the filters the clients send
(api-client ``drillDownListParams``): approved rows in the range, in active properties, revenue or
expenses told apart by category, narrowed to a category, a property or a set of either. Its total comes
from the server across every page, so it must match ``summary_service.get_summary`` for the same inputs,
whatever rows the two would treat differently if their filters drifted: other statuses, deleted rows,
another organization, an inactive property, rows with no property, neutral categories, other dates.
"""
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.property_constants import UNASSIGNED_PROPERTY_ID
from app.core.tags import transaction_type_for_category
from app.models.organization.organization import Organization
from app.models.properties.property import Property, PropertyType
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.services.transactions import summary_service
from tests.test_transaction_routes import (  # noqa: F401  (fixtures)
    _patch_service_session,
    client,
    org,
    owner,
)

START = date(2025, 3, 1)
END = date(2025, 3, 31)
# What every drill-down asks for, beside its own narrowing (api-client drillDownListParams).
DRILL_DOWN_BASE = {"status": "approved", "active_properties_only": "true", "start_date": START.isoformat(), "end_date": END.isoformat()}


@pytest.fixture(autouse=True)
def _patch_summary_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_session():
        yield db

    with patch("app.services.transactions.summary_service.AsyncSessionLocal", _fake_session):
        yield


async def _property(db: AsyncSession, org: Organization, owner: User, name: str, *, is_active: bool = True) -> Property:
    p = Property(id=uuid.uuid4(), organization_id=org.id, user_id=owner.id, name=name, type=PropertyType.SHORT_TERM, is_active=is_active)
    db.add(p)
    await db.commit()
    return p


def _txn(
    org_id: uuid.UUID,
    owner: User,
    amount: str,
    category: str,
    *,
    property_id: uuid.UUID | None,
    on: date = date(2025, 3, 15),
    status: str = "approved",
    deleted: bool = False,
) -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=owner.id,
        property_id=property_id,
        transaction_date=on,
        tax_year=on.year,
        vendor=f"{category} {amount}",
        amount=Decimal(amount),
        transaction_type=transaction_type_for_category(category),
        category=category,
        tags=[category],
        status=status,
        deleted_at=datetime.now(timezone.utc) if deleted else None,
    )


@pytest_asyncio.fixture()
async def seeded(db: AsyncSession, org: Organization, owner: User) -> dict[str, Property]:
    """Rows the summary counts, and rows it leaves out that a drifted drill-down filter would pick up."""
    beach = await _property(db, org, owner, "Beach")
    city = await _property(db, org, owner, "City")
    sold = await _property(db, org, owner, "Sold", is_active=False)
    other_owner = User(id=uuid.uuid4(), email="other@example.com", hashed_password="x", is_active=True, is_superuser=False, is_verified=True)
    other_org = Organization(id=uuid.uuid4(), name="Other", created_by=other_owner.id)
    db.add_all([other_owner, other_org])
    await db.commit()

    db.add_all([
        # Counted.
        _txn(org.id, owner, "1200.00", "rental_revenue", property_id=beach.id),
        _txn(org.id, owner, "80.10", "cleaning_fee_revenue", property_id=beach.id, on=date(2025, 3, 1)),
        _txn(org.id, owner, "950.00", "rental_revenue", property_id=city.id, on=date(2025, 3, 31)),
        _txn(org.id, owner, "300.00", "rental_revenue", property_id=None),
        _txn(org.id, owner, "125.35", "maintenance", property_id=beach.id),
        _txn(org.id, owner, "60.20", "utilities", property_id=city.id),
        _txn(org.id, owner, "45.00", "utilities", property_id=beach.id),
        _txn(org.id, owner, "19.99", "supplies", property_id=None),
        # Neither revenue nor expenses.
        _txn(org.id, owner, "500.00", "security_deposit", property_id=beach.id),
        # Left out by status, deletion, date, an inactive property or another organization.
        _txn(org.id, owner, "7000.00", "rental_revenue", property_id=beach.id, status="pending"),
        _txn(org.id, owner, "7100.00", "maintenance", property_id=beach.id, status="needs_review"),
        _txn(org.id, owner, "7200.00", "utilities", property_id=city.id, status="duplicate"),
        _txn(org.id, owner, "7300.00", "rental_revenue", property_id=None, status="unverified"),
        _txn(org.id, owner, "7400.00", "maintenance", property_id=city.id, deleted=True),
        _txn(org.id, owner, "7500.00", "rental_revenue", property_id=beach.id, on=date(2025, 2, 28)),
        _txn(org.id, owner, "7600.00", "utilities", property_id=None, on=date(2025, 4, 1)),
        _txn(org.id, owner, "7700.00", "rental_revenue", property_id=sold.id),
        _txn(org.id, owner, "7800.00", "maintenance", property_id=sold.id),
        _txn(other_org.id, other_owner, "7900.00", "rental_revenue", property_id=None),
    ])
    await db.commit()
    return {"beach": beach, "city": city}


async def _drill_down_total(client: AsyncClient, params: dict[str, object]) -> tuple[Decimal, int]:
    """The total and count the drill-down shows, read from its first, short page as the clients read it."""
    response = await client.get("/transactions/page", params={**DRILL_DOWN_BASE, **params, "limit": 1})
    assert response.status_code == 200, response.text
    body = response.json()
    return Decimal(body["amount_total"]), body["total"]


async def _summary(org: Organization, owner: User, property_ids: list[uuid.UUID] | None = None) -> dict:
    ctx = RequestContext(organization_id=org.id, user_id=owner.id, org_role="owner")
    # Dates, not the midnight datetimes the route parses: SQLite compares the stored date as text, so
    # "2025-03-01" would sort before "2025-03-01 00:00:00" and drop the first day. Postgres compares them as dates.
    return await summary_service.get_summary(ctx, start_date=START, end_date=END, property_ids=property_ids)  # type: ignore[arg-type]


def _money(value: float) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


class TestDrillDownTotalMatchesTheDashboard:
    @pytest.mark.asyncio
    async def test_revenue_and_expenses(self, client: AsyncClient, org: Organization, owner: User, seeded: dict[str, Property]) -> None:
        summary = await _summary(org, owner)

        revenue, revenue_count = await _drill_down_total(client, {"summary_kind": "revenue"})
        expenses, expenses_count = await _drill_down_total(client, {"summary_kind": "expenses"})

        assert revenue == _money(summary["revenue"]) == Decimal("2530.10")
        assert expenses == _money(summary["expenses"]) == Decimal("250.54")
        assert (revenue_count, expenses_count) == (4, 4)

    @pytest.mark.asyncio
    async def test_each_category(self, client: AsyncClient, org: Organization, owner: User, seeded: dict[str, Property]) -> None:
        summary = await _summary(org, owner)

        for category, figure in summary["by_category"].items():
            total, _ = await _drill_down_total(client, {"category": category})
            assert total == _money(figure), category

    @pytest.mark.asyncio
    async def test_each_property_including_unassigned(self, client: AsyncClient, org: Organization, owner: User, seeded: dict[str, Property]) -> None:
        summary = await _summary(org, owner)

        for row in summary["by_property"]:
            narrowing = {"unassigned": "true"} if row["property_id"] == UNASSIGNED_PROPERTY_ID else {"property_id": row["property_id"]}
            revenue, _ = await _drill_down_total(client, {**narrowing, "summary_kind": "revenue"})
            expenses, _ = await _drill_down_total(client, {**narrowing, "summary_kind": "expenses"})
            assert (revenue, expenses) == (_money(row["revenue"]), _money(row["expenses"])), row["name"]

    @pytest.mark.asyncio
    async def test_a_property_filter_and_a_category_filter(self, client: AsyncClient, org: Organization, owner: User, seeded: dict[str, Property]) -> None:
        beach = seeded["beach"]
        summary = await _summary(org, owner, property_ids=[beach.id])
        by_month_expense = summary["by_month_expense"][0]

        expenses, _ = await _drill_down_total(client, {"summary_kind": "expenses", "property_ids": [str(beach.id)]})
        utilities_only, _ = await _drill_down_total(
            client, {"summary_kind": "expenses", "property_ids": [str(beach.id)], "categories": ["utilities"]},
        )

        assert expenses == _money(summary["expenses"]) == Decimal("170.35")
        assert utilities_only == _money(by_month_expense["utilities"]) == Decimal("45.00")

    @pytest.mark.asyncio
    async def test_a_property_month(self, client: AsyncClient, org: Organization, owner: User, seeded: dict[str, Property]) -> None:
        city = seeded["city"]
        summary = await _summary(org, owner)
        city_month = next(row for row in summary["by_property_month"] if row["property_id"] == str(city.id))["months"][0]

        revenue, _ = await _drill_down_total(client, {"property_id": str(city.id), "summary_kind": "revenue"})

        assert revenue == _money(city_month["revenue"]) == Decimal("950.00")

    @pytest.mark.asyncio
    async def test_the_total_covers_every_page_not_the_one_returned(
        self, client: AsyncClient, org: Organization, owner: User, seeded: dict[str, Property],
    ) -> None:
        pages = [
            (await client.get("/transactions/page", params={**DRILL_DOWN_BASE, "summary_kind": "revenue", "limit": 1, "offset": offset})).json()
            for offset in range(4)
        ]

        assert [page["amount_total"] for page in pages] == ["2530.10"] * 4
        assert sum(Decimal(row["amount"]) for page in pages for row in page["items"]) == Decimal("2530.10")
        assert [page["has_more"] for page in pages] == [True, True, True, False]

    @pytest.mark.asyncio
    async def test_nothing_matching_totals_zero(self, client: AsyncClient, seeded: dict[str, Property]) -> None:
        total, count = await _drill_down_total(client, {"summary_kind": "revenue", "categories": ["maintenance"]})

        assert (total, count) == (Decimal("0"), 0)
