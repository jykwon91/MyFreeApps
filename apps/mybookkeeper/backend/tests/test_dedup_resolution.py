"""Tests for dedup resolution service and DedupDecision logic."""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.source_quality import QUALITY_GAP_THRESHOLD, source_quality_rank
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.transactions.transaction import Transaction
from app.models.transactions.transaction_document import TransactionDocument
from app.models.user.user import User
from app.services.extraction.dedup_resolution_service import resolve_and_link
from app.services.extraction.dedup_service import DedupDecision


@pytest_asyncio.fixture()
async def user(db: AsyncSession) -> User:
    u = User(
        id=uuid.uuid4(),
        email="dedup-test@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


@pytest_asyncio.fixture()
async def org(db: AsyncSession, user: User) -> Organization:
    o = Organization(id=uuid.uuid4(), name="Dedup Test Org", created_by=user.id)
    db.add(o)
    await db.flush()
    m = OrganizationMember(organization_id=o.id, user_id=user.id, org_role="owner")
    db.add(m)
    await db.commit()
    await db.refresh(o)
    return o


def make_txn(org: Organization, user: User, **kwargs) -> Transaction:
    defaults = dict(
        organization_id=org.id,
        user_id=user.id,
        transaction_date=date(2025, 3, 15),
        tax_year=2025,
        amount=Decimal("500.00"),
        transaction_type="expense",
        category="maintenance",
        status="pending",
    )
    defaults.update(kwargs)
    return Transaction(**defaults)


class TestSourceQualityRank:
    def test_invoice_highest(self) -> None:
        assert source_quality_rank("invoice") == 100

    def test_receipt_above_statement(self) -> None:
        assert source_quality_rank("receipt") > source_quality_rank("statement")

    def test_unknown_returns_zero(self) -> None:
        assert source_quality_rank(None) == 0
        assert source_quality_rank("unknown_type") == 0

    def test_quality_gap_threshold(self) -> None:
        assert QUALITY_GAP_THRESHOLD == 20
        gap = source_quality_rank("invoice") - source_quality_rank("receipt")
        assert gap >= QUALITY_GAP_THRESHOLD


class TestResolveAndLinkCreate:
    @pytest.mark.anyio
    async def test_create_adds_transaction_and_link(self, db: AsyncSession, user: User, org: Organization) -> None:
        decision = DedupDecision(action="create", reason="No match")
        doc_id = uuid.uuid4()
        ext_id = uuid.uuid4()
        txn = make_txn(org, user, vendor="New Vendor")

        result = await resolve_and_link(db, decision, txn, doc_id, ext_id)
        await db.commit()

        assert result is not None
        assert result.vendor == "New Vendor"

        links = (await db.execute(
            select(TransactionDocument).where(TransactionDocument.transaction_id == result.id)
        )).scalars().all()
        assert len(links) == 1
        assert links[0].document_id == doc_id
        assert links[0].link_type == "duplicate_source"


class TestResolveAndLinkSkip:
    @pytest.mark.anyio
    async def test_skip_links_doc_to_existing(self, db: AsyncSession, user: User, org: Organization) -> None:
        existing = make_txn(org, user, vendor="Existing")
        db.add(existing)
        await db.flush()

        decision = DedupDecision(
            action="skip",
            existing_transaction=existing,
            reason="Higher quality source exists",
            confidence="high",
        )
        doc_id = uuid.uuid4()

        result = await resolve_and_link(db, decision, None, doc_id)
        await db.commit()

        assert result is None  # No new transaction created

        links = (await db.execute(
            select(TransactionDocument).where(TransactionDocument.transaction_id == existing.id)
        )).scalars().all()
        assert len(links) == 1
        assert links[0].link_type == "corroborating"


class TestResolveAndLinkReplace:
    @pytest.mark.anyio
    async def test_replace_soft_deletes_and_creates_new(self, db: AsyncSession, user: User, org: Organization) -> None:
        existing = make_txn(org, user, vendor="Old Vendor", category="utilities")
        db.add(existing)
        await db.flush()

        decision = DedupDecision(
            action="replace",
            existing_transaction=existing,
            reason="Higher quality source",
            confidence="high",
        )
        doc_id = uuid.uuid4()
        new_txn = make_txn(org, user, vendor="New Vendor", category="uncategorized")

        result = await resolve_and_link(db, decision, new_txn, doc_id)
        await db.commit()
        await db.refresh(existing)

        assert result is not None
        assert result.vendor == "New Vendor"
        assert result.category == "utilities"  # Copied from old
        assert existing.deleted_at is not None  # Old soft-deleted


class TestResolveAndLinkReview:
    @pytest.mark.anyio
    async def test_review_creates_with_needs_review(self, db: AsyncSession, user: User, org: Organization) -> None:
        existing = make_txn(org, user, vendor="Ambiguous")
        db.add(existing)
        await db.flush()

        decision = DedupDecision(
            action="review",
            existing_transaction=existing,
            reason="Same amount, different vendor",
            confidence="low",
        )
        doc_id = uuid.uuid4()
        new_txn = make_txn(org, user, vendor="Maybe Same")

        result = await resolve_and_link(db, decision, new_txn, doc_id)
        await db.commit()

        assert result is not None
        assert result.status == "needs_review"


class TestTransactionDocumentModel:
    @pytest.mark.anyio
    async def test_junction_table_roundtrip(self, db: AsyncSession, user: User, org: Organization) -> None:
        txn = make_txn(org, user)
        db.add(txn)
        await db.flush()

        doc_id = uuid.uuid4()
        link = TransactionDocument(
            transaction_id=txn.id,
            document_id=doc_id,
            link_type="manual",
        )
        db.add(link)
        await db.commit()
        await db.refresh(link)

        assert link.transaction_id == txn.id
        assert link.document_id == doc_id
        assert link.link_type == "manual"
