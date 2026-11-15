"""GET /transactions/page: one page at a time with the total the filters match, so the web list can page past any count.

Also the web table's column filters (any-of lists), its Property and Tax sorts, its shift-click
multi-column sort (repeated ``sort=column:direction``), "select all"
(GET /transactions/selection) and the Category filter's choices (GET /transactions/categories).
"""
import csv
import io
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from typing import get_args
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.transaction_list_constants import DEFAULT_TRANSACTION_PAGE_SIZE, MAX_TRANSACTION_PAGE_SIZE
from app.core.transaction_sort_constants import TransactionSortField
from app.models.organization.organization import Organization
from app.models.properties.property import Property, PropertyType
from app.models.user.user import User
from app.repositories import transaction_repo
from tests.test_transaction_routes import (  # noqa: F401  (fixtures)
    _other_org_transaction,
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


async def _another_property(db: AsyncSession, org: Organization, owner: User, name: str) -> Property:
    p = Property(id=uuid.uuid4(), organization_id=org.id, user_id=owner.id, name=name, type=PropertyType.SHORT_TERM)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def _vendors(client: AsyncClient, params: dict[str, object]) -> list[str]:
    response = await client.get("/transactions/page", params=params)
    assert response.status_code == 200, response.text
    return [row["vendor"] for row in response.json()["items"]]


class TestTransactionPage:
    @pytest.mark.asyncio
    async def test_pages_carry_the_full_total_and_say_when_more_are_left(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        seeded = [await _seed_transaction(db, org, owner) for _ in range(5)]

        pages = [
            (await client.get("/transactions/page", params={"limit": 2, "offset": offset})).json()
            for offset in (0, 2, 4)
        ]

        assert [page["total"] for page in pages] == [5, 5, 5]
        assert [page["has_more"] for page in pages] == [True, True, False]
        # Rows sharing a date never repeat or go missing between pages.
        seen = [row["id"] for page in pages for row in page["items"]]
        assert sorted(seen) == sorted(str(t.id) for t in seeded)

    @pytest.mark.asyncio
    async def test_the_total_counts_what_the_filters_match_not_what_the_page_holds(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        for _ in range(3):
            await _seed_transaction(db, org, owner, status="approved")
        await _seed_transaction(db, org, owner, status="pending")
        deleted = await _seed_transaction(db, org, owner, status="approved")
        deleted.deleted_at = datetime.now(timezone.utc)
        await db.commit()
        await _other_org_transaction(db)

        body = (await client.get("/transactions/page", params={"status": "approved", "limit": 1})).json()

        assert body["total"] == 3
        assert body["has_more"] is True
        assert [row["status"] for row in body["items"]] == ["approved"]

    @pytest.mark.asyncio
    async def test_defaults_to_one_page_and_caps_the_page_size(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        await _seed_transaction(db, org, owner)

        body = (await client.get("/transactions/page")).json()
        assert body == {"items": body["items"], "total": 1, "has_more": False}
        assert len(body["items"]) == 1
        assert DEFAULT_TRANSACTION_PAGE_SIZE <= MAX_TRANSACTION_PAGE_SIZE

        too_big = await client.get("/transactions/page", params={"limit": MAX_TRANSACTION_PAGE_SIZE + 1})
        assert too_big.status_code == 422
        negative = await client.get("/transactions/page", params={"offset": -1})
        assert negative.status_code == 422


class TestColumnFilters:
    @pytest.mark.asyncio
    async def test_each_list_keeps_rows_matching_any_of_its_values(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User, prop: Property,
    ) -> None:
        await _seed_transaction(db, org, owner, vendor="Pending repair", status="pending", category="maintenance")
        await _seed_transaction(db, org, owner, vendor="Approved power", status="approved", category="utilities")
        await _seed_transaction(db, org, owner, vendor="Review cleaning", status="needs_review", category="cleaning_expense")
        await _seed_transaction(
            db, org, owner, vendor="Rent", status="approved", transaction_type="income", category="rental_revenue",
            property_id=prop.id,
        )

        assert sorted(await _vendors(client, {"statuses": ["pending", "needs_review"]})) == ["Pending repair", "Review cleaning"]
        assert await _vendors(client, {"transaction_types": ["income"]}) == ["Rent"]
        assert sorted(await _vendors(client, {"categories": ["utilities", "rental_revenue"]})) == ["Approved power", "Rent"]
        # Narrows on top of the single-value filter of the same column, as the table's filters did on top of the bar's.
        assert await _vendors(client, {"status": "approved", "statuses": ["approved", "pending"], "categories": ["utilities"]}) == [
            "Approved power"
        ]

    @pytest.mark.asyncio
    async def test_property_ids_take_the_unassigned_sentinel_alongside_real_ids(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User, prop: Property,
    ) -> None:
        other = await _another_property(db, org, owner, "Other")
        await _seed_transaction(db, org, owner, vendor="At test property", property_id=prop.id)
        await _seed_transaction(db, org, owner, vendor="At other", property_id=other.id)
        await _seed_transaction(db, org, owner, vendor="Nowhere")

        assert sorted(await _vendors(client, {"property_ids": ["unassigned", str(prop.id)]})) == ["At test property", "Nowhere"]
        assert await _vendors(client, {"property_ids": ["unassigned"]}) == ["Nowhere"]
        assert await _vendors(client, {"property_ids": [str(other.id)]}) == ["At other"]

    @pytest.mark.asyncio
    async def test_refuses_values_outside_each_allowlist(self, client: AsyncClient) -> None:
        for params in (
            {"statuses": "archived"},
            {"transaction_types": "transfer"},
            {"categories": "groceries"},
            {"property_ids": "not-a-uuid"},
            {"sort_by": "description"},
        ):
            response = await client.get("/transactions/page", params=params)
            assert response.status_code == 422, params

    @pytest.mark.asyncio
    async def test_the_export_reads_the_same_lists(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        await _seed_transaction(db, org, owner, vendor="Keep", status="approved")
        await _seed_transaction(db, org, owner, vendor="Drop", status="pending")

        exported = await client.get("/exports/transactions/csv", params={"statuses": ["approved"]})
        rows = list(csv.reader(io.StringIO(exported.content.decode("utf-8"))))[1:]

        assert exported.status_code == 200
        assert [row[1] for row in rows] == ["Keep"]


class TestPropertyAndTaxSort:
    @pytest.mark.asyncio
    async def test_property_sorts_by_name_with_no_property_first_ascending(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        # Ids run opposite to names, so an id sort would come out reversed.
        zebra = await _another_property(db, org, owner, "zebra Lodge")
        alpha = await _another_property(db, org, owner, "Alpha House")
        await _seed_transaction(db, org, owner, vendor="Z", property_id=zebra.id)
        await _seed_transaction(db, org, owner, vendor="A", property_id=alpha.id)
        await _seed_transaction(db, org, owner, vendor="None")

        assert await _vendors(client, {"sort_by": "property_id", "sort_dir": "asc"}) == ["None", "A", "Z"]
        assert await _vendors(client, {"sort_by": "property_id", "sort_dir": "desc"}) == ["Z", "A", "None"]

    @pytest.mark.asyncio
    async def test_property_sort_pages_without_repeats_when_names_tie(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User, prop: Property,
    ) -> None:
        seeded = [await _seed_transaction(db, org, owner, property_id=prop.id) for _ in range(5)]

        pages = [
            (await client.get("/transactions/page", params={"sort_by": "property_id", "limit": 2, "offset": offset})).json()
            for offset in (0, 2, 4)
        ]

        assert sorted(row["id"] for page in pages for row in page["items"]) == sorted(str(t.id) for t in seeded)

    @pytest.mark.asyncio
    async def test_tax_sorts_by_whether_the_row_counts(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        await _seed_transaction(db, org, owner, vendor="Counts", tax_relevant=True)
        await _seed_transaction(db, org, owner, vendor="Personal", tax_relevant=False)

        assert await _vendors(client, {"sort_by": "tax_relevant", "sort_dir": "asc"}) == ["Personal", "Counts"]
        assert await _vendors(client, {"sort_by": "tax_relevant", "sort_dir": "desc"}) == ["Counts", "Personal"]


class TestMultiColumnSort:
    @pytest.mark.asyncio
    async def test_orders_by_each_key_in_turn_across_a_page_boundary(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        alpha = await _another_property(db, org, owner, "Alpha House")
        beta = await _another_property(db, org, owner, "Beta Lodge")
        for home, amount in ((beta, "20.00"), (alpha, "10.00"), (beta, "5.00"), (alpha, "30.00"), (beta, "40.00")):
            await _seed_transaction(db, org, owner, vendor=f"{home.name[0]}{amount}", amount=Decimal(amount), property_id=home.id)
        params = {"sort": ["property_id:asc", "amount:desc"], "limit": 2}

        pages = [
            (await client.get("/transactions/page", params={**params, "offset": offset})).json()
            for offset in (0, 2, 4)
        ]

        assert [row["vendor"] for page in pages for row in page["items"]] == ["A30.00", "A10.00", "B40.00", "B20.00", "B5.00"]
        assert {page["total"] for page in pages} == {5}

    @pytest.mark.asyncio
    async def test_the_total_counts_the_rows_the_sorted_list_pages_through(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User, prop: Property,
    ) -> None:
        for index in range(5):
            await _seed_transaction(db, org, owner, vendor=f"Row {index}", status="pending", amount=Decimal(index % 2 + 1))
        await _seed_transaction(db, org, owner, vendor="Other status", status="approved")
        params = {"sort": ["amount:asc", "vendor:desc"], "statuses": ["pending"], "limit": 3}

        pages = [
            (await client.get("/transactions/page", params={**params, "offset": offset})).json()
            for offset in (0, 3)
        ]
        listed = [row["id"] for page in pages for row in page["items"]]

        assert {page["total"] for page in pages} == {len(listed)} == {5}
        assert len(set(listed)) == 5

    @pytest.mark.asyncio
    async def test_the_list_replaces_sort_by_and_the_export_follows_it(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        await _seed_transaction(db, org, owner, vendor="Beta", amount=Decimal("5.00"))
        await _seed_transaction(db, org, owner, vendor="Alpha", amount=Decimal("5.00"))
        await _seed_transaction(db, org, owner, vendor="Gamma", amount=Decimal("50.00"))
        params = {"sort": ["amount:asc", "vendor:asc"], "sort_by": "vendor", "sort_dir": "desc"}

        listed = await _vendors(client, params)
        exported = await client.get("/exports/transactions/csv", params=params)
        rows = list(csv.reader(io.StringIO(exported.content.decode("utf-8"))))[1:]

        assert listed == ["Alpha", "Beta", "Gamma"]
        assert [row[1] for row in rows] == listed

    @pytest.mark.asyncio
    async def test_refuses_keys_outside_the_allowlist_repeats_and_too_many(self, client: AsyncClient) -> None:
        every_column = [f"{field}:asc" for field in get_args(TransactionSortField)]
        for sort in (
            ["description:asc"],
            ["amount:up"],
            ["amount"],
            ["amount:asc", "amount:desc"],
            [*every_column, "amount:desc"],
        ):
            response = await client.get("/transactions/page", params={"sort": sort})
            assert response.status_code == 422, sort

    @pytest.mark.asyncio
    async def test_takes_one_key_per_sortable_column(self, client: AsyncClient) -> None:
        every_column = [f"{field}:desc" for field in get_args(TransactionSortField)]

        response = await client.get("/transactions/page", params={"sort": every_column})

        assert response.status_code == 200, response.text


class TestSelectionAndCategories:
    @pytest.mark.asyncio
    async def test_selection_holds_every_matching_row_not_just_a_page(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User, prop: Property,
    ) -> None:
        matching = [await _seed_transaction(db, org, owner, status="pending", property_id=prop.id) for _ in range(3)]
        await _seed_transaction(db, org, owner, status="approved")
        await _other_org_transaction(db)

        response = await client.get("/transactions/selection", params={"statuses": ["pending"]})

        assert response.status_code == 200
        body = response.json()
        assert sorted(ref["id"] for ref in body) == sorted(str(t.id) for t in matching)
        assert {(ref["property_id"], ref["status"]) for ref in body} == {(str(prop.id), "pending")}

    @pytest.mark.asyncio
    async def test_categories_lists_each_matching_category_once(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        await _seed_transaction(db, org, owner, category="utilities", vendor="Power")
        await _seed_transaction(db, org, owner, category="utilities", vendor="Water")
        await _seed_transaction(db, org, owner, category="maintenance", vendor="Plumber")
        await _other_org_transaction(db)

        assert (await client.get("/transactions/categories")).json() == ["maintenance", "utilities"]
        assert (await client.get("/transactions/categories", params={"vendor": "power"})).json() == ["utilities"]


class TestCountFiltered:
    @pytest.mark.asyncio
    async def test_counts_the_same_rows_the_list_returns(
        self, db: AsyncSession, org: Organization, owner: User, prop: Property,
    ) -> None:
        await _seed_transaction(db, org, owner, status="pending", tax_relevant=True, vendor="Alpha Plumbing")
        await _seed_transaction(db, org, owner, status="needs_review", tax_relevant=False, vendor="Beta Power")
        await _seed_transaction(db, org, owner, status="approved", tax_relevant=True, vendor="Alpha Gas")
        await _seed_transaction(db, org, owner, status="approved", vendor="Assigned", property_id=prop.id)

        for filters in (
            {},
            {"to_review": True},
            {"tax_relevant": True},
            {"vendor": "alpha"},
            {"unassigned": True, "status": "approved"},
            {"statuses": ["pending", "approved"]},
            {"statuses": ["needs_review"], "tax_relevant": False},
            {"categories": ["maintenance"], "transaction_types": ["expense"]},
            {"property_ids": ["unassigned"]},
            {"property_ids": [prop.id, "unassigned"], "statuses": ["approved"]},
        ):
            listed = await transaction_repo.list_filtered(db, org.id, **filters)  # type: ignore[arg-type]
            counted = await transaction_repo.count_filtered(db, org.id, **filters)  # type: ignore[arg-type]
            assert counted == len(listed), filters
