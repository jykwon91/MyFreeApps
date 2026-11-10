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
from sqlalchemy import select
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import current_user_id
from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.core.transaction_bulk_constants import MAX_BULK_TRANSACTION_IDS
from app.main import app
from app.models.organization.organization import Organization
from app.models.system.audit_log import AuditLog
from app.models.properties.property import Property, PropertyType
from app.models.transactions.transaction import Transaction
from app.models.transactions.transaction_document import TransactionDocument
from app.models.user.user import User
from app.repositories import transaction_repo
from app.repositories.transactions.transaction_bulk_repo import live_transactions_for_update_stmt
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


async def _link_new_document(db: AsyncSession, txn: Transaction) -> uuid.UUID:
    from app.models.documents.document import Document

    doc = Document(
        id=uuid.uuid4(), organization_id=txn.organization_id, user_id=txn.user_id,
        file_name="d.pdf", source="upload", status="completed",
    )
    db.add(doc)
    await db.flush()
    db.add(TransactionDocument(transaction_id=txn.id, document_id=doc.id, link_type="duplicate_source"))
    await db.commit()
    return doc.id


async def _other_org_transaction(db: AsyncSession) -> Transaction:
    """A reviewable transaction with a property, belonging to an org the caller is not in."""
    from app.repositories import organization_repo

    stranger = User(
        id=uuid.uuid4(), email="stranger@example.com", hashed_password="fakehash",
        is_active=True, is_superuser=False, is_verified=True,
    )
    db.add(stranger)
    await db.commit()
    other_org = await organization_repo.create(db, "Other Org", stranger.id)
    await db.commit()
    other_prop = Property(
        id=uuid.uuid4(), organization_id=other_org.id, user_id=stranger.id,
        name="Other Property", type=PropertyType.SHORT_TERM,
    )
    db.add(other_prop)
    await db.commit()
    return await _seed_transaction(db, other_org, stranger, property_id=other_prop.id)


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
        assert resp.json() == {"deleted": 1, "skipped": 0}

    @pytest.mark.asyncio
    async def test_skips_unknown_already_deleted_and_other_orgs(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        live = await _seed_transaction(db, org, owner)
        gone = await _seed_transaction(db, org, owner)
        await transaction_repo.mark_deleted(db, gone)
        other_org = await _other_org_transaction(db)
        ids = [live.id, gone.id, other_org.id, uuid.uuid4()]

        resp = await client.post("/transactions/bulk-delete", json={"ids": [str(i) for i in ids]})

        assert resp.json() == {"deleted": 1, "skipped": 3}
        await db.refresh(other_org)
        assert other_org.deleted_at is None
        assert other_org.status == "pending"

    @pytest.mark.asyncio
    async def test_duplicate_ids_are_counted_once(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        txn = await _seed_transaction(db, org, owner)

        resp = await client.post("/transactions/bulk-delete", json={"ids": [str(txn.id)] * 3})

        assert resp.json() == {"deleted": 1, "skipped": 0}

    @pytest.mark.asyncio
    async def test_leaves_the_same_row_state_as_the_single_delete(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
        prop: Property,
    ) -> None:
        single = await _seed_transaction(db, org, owner, property_id=prop.id, status="approved")
        bulk = await _seed_transaction(db, org, owner, property_id=prop.id, status="approved")

        assert (await client.delete(f"/transactions/{single.id}")).status_code == 204
        await client.post("/transactions/bulk-delete", json={"ids": [str(bulk.id)]})

        await db.refresh(single)
        await db.refresh(bulk)
        assert single.deleted_at is not None and bulk.deleted_at is not None
        assert (single.status, single.property_id) == (bulk.status, bulk.property_id) == ("duplicate", prop.id)
        # Both paths leave the row soft-deleted, so the listing hides both alike.
        listed = {t["id"] for t in (await client.get("/transactions")).json()}
        assert str(single.id) not in listed and str(bulk.id) not in listed

    @pytest.mark.asyncio
    async def test_an_empty_list_is_422(self, client: AsyncClient) -> None:
        assert (await client.post("/transactions/bulk-delete", json={"ids": []})).status_code == 422

    @pytest.mark.asyncio
    async def test_ids_above_the_cap_are_422(self, client: AsyncClient) -> None:
        ids = [str(uuid.uuid4()) for _ in range(MAX_BULK_TRANSACTION_IDS + 1)]
        assert (await client.post("/transactions/bulk-delete", json={"ids": ids})).status_code == 422

    @pytest.mark.asyncio
    async def test_ids_at_the_cap_are_accepted(self, client: AsyncClient) -> None:
        ids = [str(uuid.uuid4()) for _ in range(MAX_BULK_TRANSACTION_IDS)]
        resp = await client.post("/transactions/bulk-delete", json={"ids": ids})
        assert resp.status_code == 200
        assert resp.json() == {"deleted": 0, "skipped": MAX_BULK_TRANSACTION_IDS}


async def _update_audit_rows(
    db: AsyncSession, transaction_id: uuid.UUID,
) -> set[tuple[str | None, str | None, str | None, str | None]]:
    """The (field, old, new, changed_by) of every UPDATE audit row written for the transaction."""
    rows = (await db.execute(
        select(AuditLog).where(
            AuditLog.table_name == "transactions",
            AuditLog.record_id == str(transaction_id),
            AuditLog.operation == "UPDATE",
        )
    )).scalars().all()
    return {(row.field_name, row.old_value, row.new_value, row.changed_by) for row in rows}


def _without_timestamps(rows: set[tuple[str | None, str | None, str | None, str | None]]):
    """deleted_at differs per call by design; compare which fields changed, and the rest exactly."""
    return {(f, o, n if f != "deleted_at" else None, by) for f, o, n, by in rows}


@pytest.fixture()
def acting_user(owner: User):
    token = current_user_id.set(str(owner.id))
    yield str(owner.id)
    current_user_id.reset(token)


@pytest.mark.usefixtures("audit_listeners")
class TestBulkAuditTrail:
    @pytest.mark.asyncio
    async def test_bulk_delete_audits_every_row_like_the_single_delete(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User, acting_user: str,
    ) -> None:
        single = await _seed_transaction(db, org, owner, status="approved")
        bulk = [await _seed_transaction(db, org, owner, status="approved") for _ in range(3)]

        assert (await client.delete(f"/transactions/{single.id}")).status_code == 204
        await client.post("/transactions/bulk-delete", json={"ids": [str(t.id) for t in bulk]})

        expected = _without_timestamps(await _update_audit_rows(db, single.id))
        assert {f for f, _, _, _ in expected} >= {"status", "deleted_at"}
        assert {by for _, _, _, by in expected} == {acting_user}
        for txn in bulk:
            assert _without_timestamps(await _update_audit_rows(db, txn.id)) == expected

    @pytest.mark.asyncio
    async def test_bulk_approve_audits_every_row_like_the_single_approve(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User, prop: Property,
        acting_user: str,
    ) -> None:
        single = await _seed_transaction(db, org, owner, property_id=prop.id, status="pending")
        bulk = [await _seed_transaction(db, org, owner, property_id=prop.id, status="pending") for _ in range(3)]

        assert (await client.patch(f"/transactions/{single.id}", json={"status": "approved"})).status_code == 200
        await client.post("/transactions/bulk-approve", json={"ids": [str(t.id) for t in bulk]})

        expected = await _update_audit_rows(db, single.id)
        assert ("status", "pending", "approved", acting_user) in expected
        for txn in bulk:
            assert await _update_audit_rows(db, txn.id) == expected


class TestBulkLocking:
    def test_the_row_select_locks_in_id_order(self) -> None:
        stmt = live_transactions_for_update_stmt([uuid.uuid4()], uuid.uuid4())

        sql = str(stmt.compile(dialect=postgresql.dialect()))

        # SQLite ignores FOR UPDATE, so assert on the Postgres rendering.
        assert sql.rstrip().endswith("FOR UPDATE")
        assert "ORDER BY transactions.id" in sql


class TestBulkApproveLimits:
    @pytest.mark.asyncio
    async def test_duplicate_ids_are_counted_once(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User, prop: Property,
    ) -> None:
        txn = await _seed_transaction(db, org, owner, property_id=prop.id, status="pending")

        resp = await client.post("/transactions/bulk-approve", json={"ids": [str(txn.id)] * 3})

        assert resp.json() == {"approved": 1, "skipped": 0}


    @pytest.mark.asyncio
    async def test_an_empty_list_is_422(self, client: AsyncClient) -> None:
        assert (await client.post("/transactions/bulk-approve", json={"ids": []})).status_code == 422

    @pytest.mark.asyncio
    async def test_ids_above_the_cap_are_422(self, client: AsyncClient) -> None:
        ids = [str(uuid.uuid4()) for _ in range(MAX_BULK_TRANSACTION_IDS + 1)]
        assert (await client.post("/transactions/bulk-approve", json={"ids": ids})).status_code == 422

    @pytest.mark.asyncio
    async def test_other_orgs_are_skipped(
        self, client: AsyncClient, db: AsyncSession,
    ) -> None:
        other_org = await _other_org_transaction(db)

        resp = await client.post("/transactions/bulk-approve", json={"ids": [str(other_org.id)]})

        assert resp.json() == {"approved": 0, "skipped": 1}
        await db.refresh(other_org)
        assert other_org.status == "pending"


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


class TestKeepDuplicate:
    @pytest.mark.asyncio
    async def test_delete_ids_must_be_within_the_cap(self, client: AsyncClient) -> None:
        keep = str(uuid.uuid4())
        for delete_ids in ([], [str(uuid.uuid4()) for _ in range(MAX_BULK_TRANSACTION_IDS + 1)]):
            resp = await client.post("/transactions/duplicates/keep", json={"keep_id": keep, "delete_ids": delete_ids})
            assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_another_orgs_delete_id_is_neither_deleted_nor_linked(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        keep = await _seed_transaction(db, org, owner)
        mine = await _seed_transaction(db, org, owner)
        theirs = await _other_org_transaction(db)
        doc_mine, doc_theirs = await _link_new_document(db, mine), await _link_new_document(db, theirs)

        resp = await client.post("/transactions/duplicates/keep", json={
            "keep_id": str(keep.id), "delete_ids": [str(mine.id), str(theirs.id)],
        })

        assert resp.json() == {"kept": 1, "deleted": 1}
        await db.refresh(theirs)
        assert theirs.deleted_at is None
        linked = (await db.execute(
            select(TransactionDocument.document_id).where(TransactionDocument.transaction_id == keep.id)
        )).scalars().all()
        assert linked == [doc_mine]
        assert doc_theirs not in linked

    @pytest.mark.asyncio
    async def test_a_soft_deleted_keep_id_is_404(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        gone = await _seed_transaction(db, org, owner)
        await transaction_repo.mark_deleted(db, gone)
        other = await _seed_transaction(db, org, owner)

        resp = await client.post("/transactions/duplicates/keep", json={
            "keep_id": str(gone.id), "delete_ids": [str(other.id)],
        })

        assert resp.status_code == 404
        await db.refresh(other)
        assert other.deleted_at is None

    @pytest.mark.asyncio
    async def test_keep_locks_both_sides_in_one_org_scoped_select(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        keep = await _seed_transaction(db, org, owner)
        other = await _seed_transaction(db, org, owner)
        statements: list[str] = []
        real = live_transactions_for_update_stmt

        def record(*args, **kwargs):
            stmt = real(*args, **kwargs)
            statements.append(str(stmt.compile(dialect=postgresql.dialect())))
            return stmt

        with patch("app.repositories.transactions.transaction_bulk_repo.live_transactions_for_update_stmt", record):
            await client.post("/transactions/duplicates/keep", json={
                "keep_id": str(keep.id), "delete_ids": [str(other.id)],
            })

        # SQL-level check only: SQLite ignores FOR UPDATE, so this shows the statement, not runtime behaviour.
        assert len(statements) == 1
        sql = statements[0]
        assert sql.rstrip().endswith("FOR UPDATE")
        assert "ORDER BY transactions.id" in sql
        assert "transactions.organization_id =" in sql and "transactions.deleted_at IS NULL" in sql


    @pytest.mark.asyncio
    async def test_keep_id_in_delete_ids_is_422_and_deletes_nothing(
        self, client: AsyncClient, db: AsyncSession, org: Organization, owner: User,
    ) -> None:
        txn = await _seed_transaction(db, org, owner)

        resp = await client.post("/transactions/duplicates/keep", json={
            "keep_id": str(txn.id), "delete_ids": [str(txn.id)],
        })

        assert resp.status_code == 422
        await db.refresh(txn)
        assert txn.deleted_at is None
