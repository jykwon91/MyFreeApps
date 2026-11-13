"""The transaction list can be ordered by a chosen column and narrowed to tax-relevant rows, on the server, so paging stays right."""
import csv
import io
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.user.user import User
from app.repositories import transaction_repo
from tests.test_transaction_repo import _make_transaction
from tests.test_transaction_routes import (  # noqa: F401  (fixtures)
    _patch_service_session,
    _seed_transaction,
    client,
    org,
    owner,
    prop,
)


@pytest.fixture(autouse=True)
def _patch_export_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_session():
        yield db

    with patch("app.services.transactions.export_service.AsyncSessionLocal", _fake_session):
        yield


class TestListFilteredTaxRelevant:
    @pytest.mark.asyncio
    async def test_narrows_to_either_side_and_leaves_both_when_unset(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await transaction_repo.create(db, _make_transaction(test_org.id, test_user.id, vendor="Counts", tax_relevant=True))
        await transaction_repo.create(db, _make_transaction(test_org.id, test_user.id, vendor="Personal", tax_relevant=False))
        await db.commit()

        relevant = await transaction_repo.list_filtered(db, test_org.id, tax_relevant=True)
        not_relevant = await transaction_repo.list_filtered(db, test_org.id, tax_relevant=False)
        both = await transaction_repo.list_filtered(db, test_org.id)

        assert [t.vendor for t in relevant] == ["Counts"]
        assert [t.vendor for t in not_relevant] == ["Personal"]
        assert sorted(t.vendor for t in both) == ["Counts", "Personal"]


class TestListFilteredOrder:
    @pytest.mark.asyncio
    async def test_newest_first_by_default(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        for day in (3, 1, 2):
            await transaction_repo.create(
                db, _make_transaction(test_org.id, test_user.id, vendor=f"Day {day}", transaction_date=date(2025, 1, day)),
            )
        await db.commit()

        results = await transaction_repo.list_filtered(db, test_org.id)
        assert [t.vendor for t in results] == ["Day 3", "Day 2", "Day 1"]

    @pytest.mark.asyncio
    async def test_orders_amounts_as_numbers_both_ways(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        for amount in ("9.00", "100.00", "25.50"):
            await transaction_repo.create(db, _make_transaction(test_org.id, test_user.id, vendor=amount, amount=Decimal(amount)))
        await db.commit()

        ascending = await transaction_repo.list_filtered(db, test_org.id, sort_by="amount", sort_dir="asc")
        descending = await transaction_repo.list_filtered(db, test_org.id, sort_by="amount", sort_dir="desc")

        assert [t.vendor for t in ascending] == ["9.00", "25.50", "100.00"]
        assert [t.vendor for t in descending] == ["100.00", "25.50", "9.00"]

    @pytest.mark.asyncio
    async def test_a_missing_vendor_goes_last_either_way(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        nameless = _make_transaction(test_org.id, test_user.id)
        nameless.vendor = None
        await transaction_repo.create(db, nameless)
        await transaction_repo.create(db, _make_transaction(test_org.id, test_user.id, vendor="Acme"))
        await transaction_repo.create(db, _make_transaction(test_org.id, test_user.id, vendor="Zeta"))
        await db.commit()

        ascending = await transaction_repo.list_filtered(db, test_org.id, sort_by="vendor", sort_dir="asc")
        descending = await transaction_repo.list_filtered(db, test_org.id, sort_by="vendor", sort_dir="desc")

        assert [t.vendor for t in ascending] == ["Acme", "Zeta", None]
        assert [t.vendor for t in descending] == ["Zeta", "Acme", None]

    @pytest.mark.asyncio
    async def test_pages_of_a_sorted_list_neither_repeat_nor_skip_rows(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        # Every row shares its category, so only the tie-breakers keep the pages apart.
        for index in range(7):
            await transaction_repo.create(
                db, _make_transaction(test_org.id, test_user.id, vendor=f"Row {index}", transaction_date=date(2025, 1, 1 + index % 2)),
            )
        await db.commit()

        pages = [
            await transaction_repo.list_filtered(db, test_org.id, sort_by="category", sort_dir="asc", limit=3, offset=offset)
            for offset in (0, 3, 6)
        ]
        ids = [t.id for page in pages for t in page]
        assert len(ids) == 7
        assert len(set(ids)) == 7


class TestListRouteOrderAndTaxFilter:
    @pytest.mark.asyncio
    async def test_reads_the_sort_and_the_tax_filter_from_the_query(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User, prop: Property,
    ) -> None:
        await _seed_transaction(db, org, owner, vendor="Small", amount=Decimal("5.00"), tax_relevant=True)
        await _seed_transaction(db, org, owner, vendor="Large", amount=Decimal("500.00"), tax_relevant=True)
        await _seed_transaction(db, org, owner, vendor="Personal", amount=Decimal("50.00"), tax_relevant=False)

        response = await client.get("/transactions", params={"sort_by": "amount", "sort_dir": "asc", "tax_relevant": "true"})

        assert response.status_code == 200
        assert [t["vendor"] for t in response.json()] == ["Small", "Large"]

    @pytest.mark.asyncio
    async def test_refuses_a_column_it_cannot_sort_by(self, client: AsyncClient) -> None:
        response = await client.get("/transactions", params={"sort_by": "description"})
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_the_export_holds_the_same_rows_in_the_same_order(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User, prop: Property,
    ) -> None:
        await _seed_transaction(db, org, owner, vendor="Small", amount=Decimal("5.00"), tax_relevant=True)
        await _seed_transaction(db, org, owner, vendor="Large", amount=Decimal("500.00"), tax_relevant=True)
        await _seed_transaction(db, org, owner, vendor="Personal", amount=Decimal("50.00"), tax_relevant=False)
        params = {"sort_by": "amount", "sort_dir": "desc", "tax_relevant": "true"}

        listed = [t["vendor"] for t in (await client.get("/transactions", params=params)).json()]
        exported = await client.get("/exports/transactions/csv", params=params)
        rows = list(csv.reader(io.StringIO(exported.content.decode("utf-8"))))[1:]

        assert listed == ["Large", "Small"]
        assert [row[1] for row in rows] == listed
