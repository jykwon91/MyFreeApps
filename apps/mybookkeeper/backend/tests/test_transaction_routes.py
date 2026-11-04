"""Tests for transaction API routes.

Uses FastAPI TestClient with dependency overrides for auth and org context.
"""
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.main import app
from app.models.organization.organization import Organization
from app.models.properties.property import Property, PropertyType
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories import transaction_repo
from app.repositories.classification import classification_rule_repo


@pytest_asyncio.fixture()
async def owner(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="txn-owner@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture()
async def org(db: AsyncSession, owner: User) -> Organization:
    from app.repositories import organization_repo
    org = await organization_repo.create(db, "Txn Test Org", owner.id)
    await db.commit()
    await db.refresh(org)
    return org


@pytest_asyncio.fixture()
async def prop(db: AsyncSession, org: Organization, owner: User) -> Property:
    p = Property(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=owner.id,
        name="Test Property",
        type=PropertyType.SHORT_TERM,
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


@pytest.fixture(autouse=True)
def _patch_service_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_session():
        yield db

    with (
        patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake_session),
        patch("app.services.transactions.transaction_service.unit_of_work", _fake_session),
    ):
        yield


def _override_org_member(user: User, org: Organization):
    async def _dep():
        return RequestContext(
            organization_id=org.id,
            user_id=user.id,
            org_role="owner",
        )
    return _dep


@pytest_asyncio.fixture()
async def client(owner: User, org: Organization):
    from app.core.auth import current_active_user as cau

    app.dependency_overrides[cau] = lambda: None
    app.dependency_overrides[current_org_member] = _override_org_member(owner, org)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

    app.dependency_overrides.clear()


async def _seed_transaction(
    db: AsyncSession,
    org: Organization,
    owner: User,
    *,
    property_id: uuid.UUID | None = None,
    status: str = "pending",
    amount: Decimal = Decimal("100.00"),
    transaction_type: str = "expense",
    category: str = "maintenance",
    tax_year: int = 2025,
    vendor: str = "Test Vendor",
    tax_relevant: bool = False,
    schedule_e_line: str | None = None,
) -> Transaction:
    txn = Transaction(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=owner.id,
        property_id=property_id,
        transaction_date=date(2025, 6, 15),
        tax_year=tax_year,
        vendor=vendor,
        amount=amount,
        transaction_type=transaction_type,
        category=category,
        status=status,
        tax_relevant=tax_relevant,
        schedule_e_line=schedule_e_line,
    )
    await transaction_repo.create(db, txn)
    await db.commit()
    await db.refresh(txn)
    return txn


class TestListTransactions:
    @pytest.mark.asyncio
    async def test_returns_200(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        await _seed_transaction(db, org, owner)
        resp = await client.get("/transactions")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    @pytest.mark.asyncio
    async def test_filters_by_status(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        await _seed_transaction(db, org, owner, status="approved")
        await _seed_transaction(db, org, owner, status="pending", vendor="Pending Co")
        resp = await client.get("/transactions", params={"status": "approved"})
        assert resp.status_code == 200
        data = resp.json()
        assert all(t["status"] == "approved" for t in data)


class TestToReview:
    @pytest.mark.asyncio
    async def test_filter_and_count_cover_the_same_rows(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        for status in ("pending", "needs_review", "unverified"):
            await _seed_transaction(db, org, owner, status=status)
        await _seed_transaction(db, org, owner, status="approved")
        await _seed_transaction(db, org, owner, status="duplicate")
        deleted = await _seed_transaction(db, org, owner, status="pending")
        deleted.deleted_at = datetime.now(timezone.utc)
        await db.commit()

        rows = (await client.get("/transactions", params={"to_review": True})).json()
        assert sorted(t["status"] for t in rows) == ["needs_review", "pending", "unverified"]

        count = await client.get("/transactions/review-count")
        assert count.status_code == 200
        assert count.json() == {"count": 3}

    @pytest.mark.asyncio
    async def test_count_is_per_organization(
        self, client: AsyncClient, db: AsyncSession, owner: User,
    ) -> None:
        from app.repositories import organization_repo

        other = await organization_repo.create(db, "Other Org", owner.id)
        await db.commit()
        await _seed_transaction(db, other, owner, status="pending")

        assert (await client.get("/transactions/review-count")).json() == {"count": 0}


class TestPaging:
    @pytest.mark.asyncio
    async def test_rows_sharing_a_date_never_repeat_or_vanish_between_pages(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        seeded = [await _seed_transaction(db, org, owner) for _ in range(5)]

        seen: list[str] = []
        for offset in range(0, 5, 2):
            page = await client.get("/transactions", params={"limit": 2, "offset": offset})
            seen.extend(t["id"] for t in page.json())

        assert sorted(seen) == sorted(str(t.id) for t in seeded)


class TestCreateTransaction:
    @pytest.mark.asyncio
    async def test_creates_manual_transaction(
        self, client: AsyncClient,
    ) -> None:
        resp = await client.post("/transactions", json={
            "transaction_date": "2025-06-15",
            "tax_year": 2025,
            "amount": "150.00",
            "transaction_type": "expense",
            "category": "maintenance",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["is_manual"] is True
        assert data["amount"] == "150.00"


class TestGetTransaction:
    @pytest.mark.asyncio
    async def test_returns_transaction(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        txn = await _seed_transaction(db, org, owner)
        resp = await client.get(f"/transactions/{txn.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == str(txn.id)

    @pytest.mark.asyncio
    async def test_returns_404_for_missing(self, client: AsyncClient) -> None:
        resp = await client.get(f"/transactions/{uuid.uuid4()}")
        assert resp.status_code == 404


class TestUpdateTransaction:
    @pytest.mark.asyncio
    async def test_updates_fields(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        txn = await _seed_transaction(db, org, owner)
        resp = await client.patch(
            f"/transactions/{txn.id}",
            json={"vendor": "Updated Vendor"},
        )
        assert resp.status_code == 200
        assert resp.json()["vendor"] == "Updated Vendor"

    @pytest.mark.asyncio
    async def test_returns_404_for_missing(self, client: AsyncClient) -> None:
        resp = await client.patch(
            f"/transactions/{uuid.uuid4()}", json={"vendor": "Nope"},
        )
        assert resp.status_code == 404


class TestClearingFields:
    @pytest.mark.asyncio
    async def test_explicit_null_clears_property_vendor_and_description(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User, prop: Property,
    ) -> None:
        txn = await _seed_transaction(db, org, owner, property_id=prop.id)
        txn.description = "Sink repair"
        await db.commit()

        resp = await client.patch(
            f"/transactions/{txn.id}",
            json={"property_id": None, "vendor": None, "description": None},
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["property_id"] is None
        assert body["vendor"] is None
        assert body["description"] is None

    @pytest.mark.asyncio
    async def test_omitting_a_field_keeps_it(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User, prop: Property,
    ) -> None:
        txn = await _seed_transaction(db, org, owner, property_id=prop.id)

        resp = await client.patch(f"/transactions/{txn.id}", json={"status": "approved"})

        assert resp.json()["property_id"] == str(prop.id)
        assert resp.json()["vendor"] == "Test Vendor"

    @pytest.mark.asyncio
    async def test_clearing_a_property_leaves_other_rows_alone(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User, prop: Property,
    ) -> None:
        cleared = await _seed_transaction(db, org, owner, property_id=prop.id)
        sibling = await _seed_transaction(db, org, owner, property_id=prop.id)
        cleared.address = "1 Oak St"
        sibling.address = "1 Oak St"
        await db.commit()

        resp = await client.patch(f"/transactions/{cleared.id}", json={"property_id": None})

        assert resp.status_code == 200
        assert resp.json()["retroactive_count"] == 0
        await db.refresh(sibling)
        assert sibling.property_id == prop.id


class TestLearnedRuleAssignment:
    @pytest.mark.asyncio
    async def test_category_fix_on_a_row_with_no_property_keeps_the_rules_property(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User, prop: Property,
    ) -> None:
        rule = await classification_rule_repo.upsert_rule(
            db,
            organization_id=org.id,
            match_type="vendor",
            pattern="Test Vendor",
            category="maintenance",
            created_by=owner.id,
            property_id=prop.id,
        )
        await db.commit()
        txn = await _seed_transaction(db, org, owner, property_id=prop.id)

        resp = await client.patch(
            f"/transactions/{txn.id}",
            json={"category": "utilities", "property_id": None},
        )

        assert resp.status_code == 200
        await db.refresh(rule)
        assert rule.category == "utilities"
        assert rule.property_id == prop.id


class TestCategoriesTheDatabaseAllows:
    @pytest.mark.asyncio
    async def test_a_supplies_row_reads_back_and_can_be_chosen(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        supplies = await _seed_transaction(db, org, owner, category="supplies")
        other = await _seed_transaction(db, org, owner)

        listed = await client.get("/transactions")
        chosen = await client.patch(f"/transactions/{other.id}", json={"category": "meals"})

        assert listed.status_code == 200
        assert {t["id"] for t in listed.json()} == {str(supplies.id), str(other.id)}
        assert chosen.status_code == 200
        assert chosen.json()["category"] == "meals"


class TestDeleteTransaction:
    @pytest.mark.asyncio
    async def test_returns_204(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        txn = await _seed_transaction(db, org, owner)
        resp = await client.delete(f"/transactions/{txn.id}")
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_returns_404_for_missing(self, client: AsyncClient) -> None:
        resp = await client.delete(f"/transactions/{uuid.uuid4()}")
        assert resp.status_code == 404


class TestBulkApprove:
    @pytest.mark.asyncio
    async def test_approves_eligible(
        self,
        client: AsyncClient,
        db: AsyncSession,
        org: Organization,
        owner: User,
        prop: Property,
    ) -> None:
        txn = await _seed_transaction(db, org, owner, property_id=prop.id, status="pending")
        resp = await client.post("/transactions/bulk-approve", json={
            "ids": [str(txn.id)],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["approved"] == 1

    @pytest.mark.asyncio
    async def test_skips_without_property(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        txn = await _seed_transaction(db, org, owner, status="pending")
        resp = await client.post("/transactions/bulk-approve", json={
            "ids": [str(txn.id)],
        })
        assert resp.status_code == 200
        assert resp.json()["approved"] == 0
        assert resp.json()["skipped"] == 1


class TestBulkDelete:
    @pytest.mark.asyncio
    async def test_deletes(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        txn = await _seed_transaction(db, org, owner)
        resp = await client.post("/transactions/bulk-delete", json={
            "ids": [str(txn.id)],
        })
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 1


class TestScheduleEReport:
    @pytest.mark.asyncio
    async def test_returns_report(
        self,
        client: AsyncClient,
        db: AsyncSession,
        org: Organization,
        owner: User,
        prop: Property,
    ) -> None:
        await _seed_transaction(
            db, org, owner,
            property_id=prop.id,
            status="approved",
            tax_relevant=True,
            tax_year=2025,
            schedule_e_line="line_7_cleaning_maintenance",
            amount=Decimal("200.00"),
        )
        resp = await client.get("/transactions/schedule-e", params={"tax_year": 2025})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert data[0]["schedule_e_line"] == "line_7_cleaning_maintenance"

    @pytest.mark.asyncio
    async def test_empty_for_no_data(self, client: AsyncClient) -> None:
        resp = await client.get("/transactions/schedule-e", params={"tax_year": 2099})
        assert resp.status_code == 200
        assert resp.json() == []
