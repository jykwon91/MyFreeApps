"""PUT / DELETE /transactions/{id}/property-splits, and edits to a split row."""
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.property_split_constants import (
    SPLIT_AMOUNTS_DONT_ADD_UP,
    SPLIT_NOT_FOR_TRANSFERS,
    SPLIT_PROPERTY_NOT_FOUND,
    SPLIT_REQUEST_ONE_FORM,
)
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.transactions.transaction_property_split import TransactionPropertySplit
from app.models.user.user import User
from tests import test_transaction_routes as routes
from tests.test_transaction_routes import _seed_transaction

client = routes.client
org = routes.org
owner = routes.owner
_patch_service_session = routes._patch_service_session


@pytest.fixture(autouse=True)
def _patch_split_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_session():
        yield db

    with patch("app.services.transactions.property_split_service.unit_of_work", _fake_session):
        yield


@pytest_asyncio.fixture()
async def houses(db: AsyncSession, org: Organization, owner: User) -> list[Property]:
    props = [
        Property(id=uuid.uuid4(), organization_id=org.id, user_id=owner.id, name=name, address=name)
        for name in ("6732 Peerless", "6734 Peerless", "6738 Peerless")
    ]
    db.add_all(props)
    await db.commit()
    return props


def _shares(body: dict) -> list[tuple[str, str]]:
    return [(share["property_id"], share["amount"]) for share in body["property_splits"]]


async def _share_rows(db: AsyncSession, txn_id: uuid.UUID) -> int:
    return await db.scalar(
        select(func.count()).select_from(TransactionPropertySplit)
        .where(TransactionPropertySplit.transaction_id == txn_id),
    )


class TestSetSplit:
    @pytest.mark.asyncio
    async def test_even_split_gives_the_odd_cent_to_the_first(
        self, client: AsyncClient, db: AsyncSession, org, owner, houses,
    ) -> None:
        txn = await _seed_transaction(db, org, owner, property_id=houses[0].id, amount=Decimal("100.00"))

        resp = await client.put(
            f"/transactions/{txn.id}/property-splits",
            json={"even_across": [str(h.id) for h in houses]},
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["property_id"] is None
        assert sorted(_shares(body)) == sorted([
            (str(houses[0].id), "33.34"), (str(houses[1].id), "33.33"), (str(houses[2].id), "33.33"),
        ])
        assert _shares(body)[0] == (str(houses[0].id), "33.34")

    @pytest.mark.asyncio
    async def test_uneven_split(self, client: AsyncClient, db: AsyncSession, org, owner, houses) -> None:
        txn = await _seed_transaction(db, org, owner, amount=Decimal("100.00"))

        resp = await client.put(f"/transactions/{txn.id}/property-splits", json={"shares": [
            {"property_id": str(houses[0].id), "amount": "20.00"},
            {"property_id": str(houses[1].id), "amount": "80.00"},
        ]})

        assert resp.status_code == 200
        assert _shares(resp.json()) == [(str(houses[1].id), "80.00"), (str(houses[0].id), "20.00")]

    @pytest.mark.asyncio
    async def test_resplitting_keeps_one_share_per_property(
        self, client: AsyncClient, db: AsyncSession, org, owner, houses,
    ) -> None:
        txn = await _seed_transaction(db, org, owner, amount=Decimal("90.00"))
        url = f"/transactions/{txn.id}/property-splits"
        await client.put(url, json={"even_across": [str(h.id) for h in houses]})

        resp = await client.put(url, json={"even_across": [str(houses[0].id), str(houses[1].id)]})

        assert resp.status_code == 200
        assert sorted(_shares(resp.json())) == sorted([(str(houses[0].id), "45.00"), (str(houses[1].id), "45.00")])
        assert await _share_rows(db, txn.id) == 2

    @pytest.mark.asyncio
    async def test_rejects_shares_that_dont_add_up(
        self, client: AsyncClient, db: AsyncSession, org, owner, houses,
    ) -> None:
        txn = await _seed_transaction(db, org, owner, property_id=houses[0].id, amount=Decimal("100.00"))

        resp = await client.put(f"/transactions/{txn.id}/property-splits", json={"shares": [
            {"property_id": str(houses[0].id), "amount": "50.00"},
            {"property_id": str(houses[1].id), "amount": "40.00"},
        ]})

        assert resp.status_code == 422
        assert SPLIT_AMOUNTS_DONT_ADD_UP in resp.json()["detail"]
        await db.refresh(txn)
        assert txn.property_id == houses[0].id
        assert await _share_rows(db, txn.id) == 0

    @pytest.mark.asyncio
    async def test_rejects_another_workspaces_property(
        self, client: AsyncClient, db: AsyncSession, org, owner, houses,
    ) -> None:
        other_org = Organization(id=uuid.uuid4(), name="Other", created_by=owner.id)
        db.add(other_org)
        foreign = Property(id=uuid.uuid4(), organization_id=other_org.id, user_id=owner.id, name="Theirs")
        db.add(foreign)
        await db.commit()
        txn = await _seed_transaction(db, org, owner, amount=Decimal("100.00"))

        resp = await client.put(
            f"/transactions/{txn.id}/property-splits",
            json={"even_across": [str(houses[0].id), str(foreign.id)]},
        )

        assert resp.status_code == 422
        assert resp.json()["detail"] == SPLIT_PROPERTY_NOT_FOUND
        assert await _share_rows(db, txn.id) == 0

    @pytest.mark.asyncio
    async def test_rejects_a_transfer(self, client: AsyncClient, db: AsyncSession, org, owner, houses) -> None:
        txn = await _seed_transaction(
            db, org, owner, amount=Decimal("100.00"), transaction_type="transfer", category="transfer",
        )

        resp = await client.put(
            f"/transactions/{txn.id}/property-splits",
            json={"even_across": [str(h.id) for h in houses]},
        )

        assert resp.status_code == 422
        assert resp.json()["detail"] == SPLIT_NOT_FOR_TRANSFERS

    @pytest.mark.asyncio
    async def test_needs_exactly_one_form(self, client: AsyncClient, db: AsyncSession, org, owner, houses) -> None:
        txn = await _seed_transaction(db, org, owner)

        resp = await client.put(f"/transactions/{txn.id}/property-splits", json={})

        assert resp.status_code == 422
        assert SPLIT_REQUEST_ONE_FORM in str(resp.json()["detail"])

    @pytest.mark.asyncio
    async def test_another_workspaces_transaction_is_not_found(
        self, client: AsyncClient, db: AsyncSession, owner, houses,
    ) -> None:
        other_org = Organization(id=uuid.uuid4(), name="Other", created_by=owner.id)
        db.add(other_org)
        await db.commit()
        theirs = await _seed_transaction(db, other_org, owner)

        resp = await client.put(
            f"/transactions/{theirs.id}/property-splits",
            json={"even_across": [str(houses[0].id), str(houses[1].id)]},
        )

        assert resp.status_code == 404


class TestRemoveSplit:
    @pytest.mark.asyncio
    async def test_removes_every_share_and_leaves_no_property(
        self, client: AsyncClient, db: AsyncSession, org, owner, houses,
    ) -> None:
        txn = await _seed_transaction(db, org, owner, amount=Decimal("100.00"))
        url = f"/transactions/{txn.id}/property-splits"
        await client.put(url, json={"even_across": [str(h.id) for h in houses]})

        resp = await client.delete(url)

        assert resp.status_code == 200
        assert resp.json()["property_splits"] == []
        assert resp.json()["property_id"] is None
        assert await _share_rows(db, txn.id) == 0


class TestEditingASplitRow:
    @pytest.mark.asyncio
    async def test_picking_one_property_ends_the_split(
        self, client: AsyncClient, db: AsyncSession, org, owner, houses,
    ) -> None:
        txn = await _seed_transaction(db, org, owner, amount=Decimal("100.00"))
        await client.put(
            f"/transactions/{txn.id}/property-splits", json={"even_across": [str(h.id) for h in houses]},
        )

        resp = await client.patch(f"/transactions/{txn.id}", json={"property_id": str(houses[2].id)})

        assert resp.status_code == 200
        assert resp.json()["property_id"] == str(houses[2].id)
        assert resp.json()["property_splits"] == []
        assert await _share_rows(db, txn.id) == 0

    @pytest.mark.asyncio
    async def test_new_amount_rescales_the_shares(
        self, client: AsyncClient, db: AsyncSession, org, owner, houses,
    ) -> None:
        txn = await _seed_transaction(db, org, owner, amount=Decimal("90.00"))
        await client.put(
            f"/transactions/{txn.id}/property-splits", json={"even_across": [str(h.id) for h in houses]},
        )

        resp = await client.patch(f"/transactions/{txn.id}", json={"amount": "100.00"})

        assert resp.status_code == 200
        amounts = [share["amount"] for share in resp.json()["property_splits"]]
        assert amounts == ["33.34", "33.33", "33.33"]

    @pytest.mark.asyncio
    async def test_editing_another_field_keeps_the_split(
        self, client: AsyncClient, db: AsyncSession, org, owner, houses,
    ) -> None:
        txn = await _seed_transaction(db, org, owner, amount=Decimal("90.00"))
        await client.put(
            f"/transactions/{txn.id}/property-splits", json={"even_across": [str(h.id) for h in houses]},
        )

        resp = await client.patch(f"/transactions/{txn.id}", json={"description": "Lawn care, June"})

        assert resp.status_code == 200
        assert len(resp.json()["property_splits"]) == 3
        assert resp.json()["property_id"] is None
