"""Tests for duplicate detection and clean re-extract features."""
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import current_admin, current_org_member
from app.main import app
from app.models.documents.document import Document
from app.models.extraction.extraction import Extraction
from app.models.organization.organization import Organization
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories.transactions import transaction_repo
from app.repositories.documents import document_repo
from app.repositories.extraction import extraction_repo


# ── Fixtures ──────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def owner(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="dup-owner@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=True,
        is_verified=True,
        role="admin",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture()
async def org(db: AsyncSession, owner: User) -> Organization:
    from app.repositories import organization_repo as org_repo
    o = await org_repo.create(db, "Dup Test Org", owner.id)
    await db.commit()
    await db.refresh(o)
    return o


@pytest_asyncio.fixture()
async def ctx(owner: User, org: Organization) -> RequestContext:
    return RequestContext(
        organization_id=org.id,
        user_id=owner.id,
        org_role="owner",
    )


def _make_transaction(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    amount: Decimal = Decimal("500.00"),
    txn_date: date = date(2025, 6, 15),
    vendor: str = "Test Vendor",
    category: str = "maintenance",
    txn_type: str = "expense",
    property_id: uuid.UUID | None = None,
    extraction_id: uuid.UUID | None = None,
) -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user_id,
        property_id=property_id,
        extraction_id=extraction_id,
        transaction_date=txn_date,
        tax_year=txn_date.year,
        vendor=vendor,
        description="Test",
        amount=amount,
        transaction_type=txn_type,
        category=category,
        status="approved",
        is_manual=False,
    )


# ── Duplicate Detection Tests ──────────────────────────────────────────


class TestFindDuplicatePairs:
    @pytest.mark.anyio
    async def test_finds_same_amount_same_date(self, db: AsyncSession, org: Organization, owner: User):
        """Two transactions with identical amount and date are detected."""
        t1 = _make_transaction(org.id, owner.id)
        t2 = _make_transaction(org.id, owner.id)
        db.add_all([t1, t2])
        await db.commit()

        pairs = await transaction_repo.find_duplicate_pairs(db, org.id)
        assert len(pairs) == 1
        ids = {pairs[0][0].id, pairs[0][1].id}
        assert ids == {t1.id, t2.id}
        assert pairs[0][2] == 0  # date_diff = 0

    @pytest.mark.anyio
    async def test_finds_same_amount_within_window(self, db: AsyncSession, org: Organization, owner: User):
        """Transactions 10 days apart with same amount are detected."""
        t1 = _make_transaction(org.id, owner.id, txn_date=date(2025, 6, 1))
        t2 = _make_transaction(org.id, owner.id, txn_date=date(2025, 6, 11))
        db.add_all([t1, t2])
        await db.commit()

        pairs = await transaction_repo.find_duplicate_pairs(db, org.id)
        assert len(pairs) == 1
        assert pairs[0][2] == 10

    @pytest.mark.anyio
    async def test_ignores_outside_window(self, db: AsyncSession, org: Organization, owner: User):
        """Transactions 20 days apart are NOT detected."""
        t1 = _make_transaction(org.id, owner.id, txn_date=date(2025, 6, 1))
        t2 = _make_transaction(org.id, owner.id, txn_date=date(2025, 6, 21))
        db.add_all([t1, t2])
        await db.commit()

        pairs = await transaction_repo.find_duplicate_pairs(db, org.id)
        assert len(pairs) == 0

    @pytest.mark.anyio
    async def test_ignores_different_amounts(self, db: AsyncSession, org: Organization, owner: User):
        """Different amounts are NOT duplicates."""
        t1 = _make_transaction(org.id, owner.id, amount=Decimal("500.00"))
        t2 = _make_transaction(org.id, owner.id, amount=Decimal("600.00"))
        db.add_all([t1, t2])
        await db.commit()

        pairs = await transaction_repo.find_duplicate_pairs(db, org.id)
        assert len(pairs) == 0

    @pytest.mark.anyio
    async def test_ignores_different_types(self, db: AsyncSession, org: Organization, owner: User):
        """Income vs expense with same amount are NOT duplicates."""
        t1 = _make_transaction(org.id, owner.id, txn_type="expense", category="maintenance")
        t2 = _make_transaction(org.id, owner.id, txn_type="income", category="rental_revenue")
        db.add_all([t1, t2])
        await db.commit()

        pairs = await transaction_repo.find_duplicate_pairs(db, org.id)
        assert len(pairs) == 0

    @pytest.mark.anyio
    async def test_ignores_deleted(self, db: AsyncSession, org: Organization, owner: User):
        """Soft-deleted transactions are excluded."""
        t1 = _make_transaction(org.id, owner.id)
        t2 = _make_transaction(org.id, owner.id)
        t2.deleted_at = datetime.now(timezone.utc)
        t2.status = "duplicate"
        db.add_all([t1, t2])
        await db.commit()

        pairs = await transaction_repo.find_duplicate_pairs(db, org.id)
        assert len(pairs) == 0

    @pytest.mark.anyio
    async def test_ignores_reviewed(self, db: AsyncSession, org: Organization, owner: User):
        """Already-reviewed transactions are excluded."""
        t1 = _make_transaction(org.id, owner.id)
        t2 = _make_transaction(org.id, owner.id)
        t2.duplicate_reviewed_at = datetime.now(timezone.utc)
        db.add_all([t1, t2])
        await db.commit()

        pairs = await transaction_repo.find_duplicate_pairs(db, org.id)
        assert len(pairs) == 0

    @pytest.mark.anyio
    async def test_null_property_matches(self, db: AsyncSession, org: Organization, owner: User):
        """Transaction with null property matches one with a property."""
        prop_id = uuid.uuid4()
        t1 = _make_transaction(org.id, owner.id, property_id=prop_id)
        t2 = _make_transaction(org.id, owner.id, property_id=None)
        db.add_all([t1, t2])
        await db.commit()

        pairs = await transaction_repo.find_duplicate_pairs(db, org.id)
        assert len(pairs) == 1


class TestMarkDuplicateReviewed:
    @pytest.mark.anyio
    async def test_marks_reviewed(self, db: AsyncSession, org: Organization, owner: User):
        t1 = _make_transaction(org.id, owner.id)
        t2 = _make_transaction(org.id, owner.id)
        db.add_all([t1, t2])
        await db.commit()

        count = await transaction_repo.mark_duplicate_reviewed(
            db, [t1.id, t2.id], org.id,
        )
        assert count == 2
        await db.refresh(t1)
        await db.refresh(t2)
        assert t1.duplicate_reviewed_at is not None
        assert t2.duplicate_reviewed_at is not None


# ── API Tests ──────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _patch_sessions(db: AsyncSession):
    @asynccontextmanager
    async def _fake_session():
        yield db

    with (
        patch("app.services.transactions.transaction_service.AsyncSessionLocal", _fake_session),
        patch("app.services.transactions.transaction_service.unit_of_work", _fake_session),
        patch("app.services.system.admin_service.AsyncSessionLocal", _fake_session),
        patch("app.services.system.admin_service.unit_of_work", _fake_session),
    ):
        yield


class TestDuplicatesAPI:
    @pytest.mark.anyio
    async def test_get_duplicates(self, db: AsyncSession, org: Organization, owner: User, ctx: RequestContext):
        t1 = _make_transaction(org.id, owner.id)
        t2 = _make_transaction(org.id, owner.id)
        db.add_all([t1, t2])
        await db.commit()

        app.dependency_overrides[current_org_member] = lambda: ctx

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            resp = await client.get("/transactions/duplicates")

        del app.dependency_overrides[current_org_member]

        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert len(data["pairs"]) >= 1
        pair = data["pairs"][0]
        assert "transaction_a" in pair
        assert "transaction_b" in pair
        assert "date_diff_days" in pair

    @pytest.mark.anyio
    async def test_dismiss_duplicates(self, db: AsyncSession, org: Organization, owner: User, ctx: RequestContext):
        t1 = _make_transaction(org.id, owner.id)
        t2 = _make_transaction(org.id, owner.id)
        db.add_all([t1, t2])
        await db.commit()

        app.dependency_overrides[current_org_member] = lambda: ctx

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            resp = await client.post(
                "/transactions/duplicates/dismiss",
                json={"transaction_ids": [str(t1.id), str(t2.id)]},
            )

        del app.dependency_overrides[current_org_member]

        assert resp.status_code == 200
        assert resp.json()["reviewed"] == 2

        # Verify they no longer show up as duplicates
        pairs = await transaction_repo.find_duplicate_pairs(db, org.id)
        assert len(pairs) == 0

    @pytest.mark.anyio
    async def test_keep_duplicate(self, db: AsyncSession, org: Organization, owner: User, ctx: RequestContext):
        t1 = _make_transaction(org.id, owner.id)
        t2 = _make_transaction(org.id, owner.id)
        db.add_all([t1, t2])
        await db.commit()

        app.dependency_overrides[current_org_member] = lambda: ctx

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            resp = await client.post(
                "/transactions/duplicates/keep",
                json={"keep_id": str(t1.id), "delete_ids": [str(t2.id)]},
            )

        del app.dependency_overrides[current_org_member]

        assert resp.status_code == 200
        data = resp.json()
        assert data["kept"] == 1
        assert data["deleted"] == 1


# ── Clean Re-Extract Tests ──────────────────────────────────────────────


class TestCleanReExtract:
    @pytest.mark.anyio
    async def test_clean_re_extract(self, db: AsyncSession, org: Organization, owner: User):
        doc = Document(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            file_name="statement_2025_01.pdf",
            file_type="pdf",
            document_type="statement",
            source="upload",
            status="completed",
        )
        db.add(doc)
        await db.flush()

        ext = Extraction(
            id=uuid.uuid4(),
            document_id=doc.id,
            organization_id=org.id,
            user_id=owner.id,
            status="completed",
            document_type="statement",
        )
        db.add(ext)
        await db.flush()

        txn = _make_transaction(
            org.id, owner.id,
            extraction_id=ext.id,
            txn_date=date(2025, 1, 15),
        )
        db.add(txn)
        await db.commit()

        app.dependency_overrides[current_admin] = lambda: owner

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            resp = await client.post(
                "/admin/clean-re-extract",
                json={
                    "organization_id": str(org.id),
                    "document_type": "statement",
                    "tax_year": 2025,
                },
            )

        del app.dependency_overrides[current_admin]

        assert resp.status_code == 200
        data = resp.json()
        assert data["documents_found"] == 1
        assert data["transactions_deleted"] == 1
        assert data["extractions_deleted"] == 1
        assert data["documents_reset"] == 1

        await db.refresh(doc)
        assert doc.status == "processing"

    @pytest.mark.anyio
    async def test_clean_re_extract_no_match(self, db: AsyncSession, org: Organization, owner: User):
        app.dependency_overrides[current_admin] = lambda: owner

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            resp = await client.post(
                "/admin/clean-re-extract",
                json={
                    "organization_id": str(org.id),
                    "document_type": "invoice",
                },
            )

        del app.dependency_overrides[current_admin]

        assert resp.status_code == 200
        data = resp.json()
        assert data["documents_found"] == 0
        assert data["transactions_deleted"] == 0
