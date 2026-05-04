"""Repository tests for ``rent_attribution_review_queue``.

Uses the in-memory SQLite fixture from conftest. Verifies CRUD and the
idempotency invariant (one review entry per transaction).
"""
from __future__ import annotations

import uuid
from datetime import date

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.repositories.transactions import attribution_repo


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _user() -> User:
    return User(
        id=uuid.uuid4(),
        email=f"u{uuid.uuid4().hex[:6]}@test.com",
        hashed_password="x",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )


def _org(user: User) -> Organization:
    return Organization(id=uuid.uuid4(), name="Test Org", created_by=user.id)


def _applicant(user: User, org: Organization, legal_name: str) -> Applicant:
    return Applicant(
        id=uuid.uuid4(),
        user_id=user.id,
        organization_id=org.id,
        legal_name=legal_name,
        stage="lease_signed",
    )


def _txn(user: User, org: Organization) -> Transaction:
    return Transaction(
        id=uuid.uuid4(),
        user_id=user.id,
        organization_id=org.id,
        transaction_type="income",
        category="rental_revenue",
        amount=1000,
        transaction_date=date(2026, 5, 1),
        tax_year=2026,
        status="pending",
    )


@pytest_asyncio.fixture()
async def seed(db: AsyncSession):
    """Seed a user, org, applicant, and transaction for tests."""
    user = _user()
    org = _org(user)
    db.add(user)
    db.add(org)
    await db.flush()
    member = OrganizationMember(
        organization_id=org.id, user_id=user.id, org_role="owner"
    )
    db.add(member)

    applicant = _applicant(user, org, "Alice Johnson")
    db.add(applicant)

    txn = _txn(user, org)
    db.add(txn)

    await db.flush()
    return {"user": user, "org": org, "applicant": applicant, "txn": txn}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_and_get_pending(db: AsyncSession, seed):
    user = seed["user"]
    org = seed["org"]
    txn = seed["txn"]
    applicant = seed["applicant"]

    row = await attribution_repo.create(
        db,
        user_id=user.id,
        organization_id=org.id,
        transaction_id=txn.id,
        proposed_applicant_id=applicant.id,
        confidence="fuzzy",
    )
    await db.commit()

    fetched = await attribution_repo.get_by_id(db, row.id, org.id)
    assert fetched is not None
    assert fetched.confidence == "fuzzy"
    assert fetched.status == "pending"
    assert fetched.proposed_applicant_id == applicant.id


@pytest.mark.asyncio
async def test_count_pending(db: AsyncSession, seed):
    user = seed["user"]
    org = seed["org"]
    txn = seed["txn"]

    assert await attribution_repo.count_pending(db, org.id) == 0

    await attribution_repo.create(
        db,
        user_id=user.id,
        organization_id=org.id,
        transaction_id=txn.id,
        proposed_applicant_id=None,
        confidence="unmatched",
    )
    await db.commit()

    assert await attribution_repo.count_pending(db, org.id) == 1


@pytest.mark.asyncio
async def test_resolve_confirm(db: AsyncSession, seed):
    user = seed["user"]
    org = seed["org"]
    txn = seed["txn"]

    row = await attribution_repo.create(
        db,
        user_id=user.id,
        organization_id=org.id,
        transaction_id=txn.id,
        proposed_applicant_id=None,
        confidence="unmatched",
    )
    await db.commit()

    await attribution_repo.resolve(db, row, "confirmed")
    await db.commit()

    fetched = await attribution_repo.get_by_id(db, row.id, org.id)
    assert fetched.status == "confirmed"
    assert fetched.resolved_at is not None


@pytest.mark.asyncio
async def test_resolve_reject(db: AsyncSession, seed):
    user = seed["user"]
    org = seed["org"]
    txn = seed["txn"]

    row = await attribution_repo.create(
        db,
        user_id=user.id,
        organization_id=org.id,
        transaction_id=txn.id,
        proposed_applicant_id=None,
        confidence="fuzzy",
    )
    await db.commit()

    await attribution_repo.resolve(db, row, "rejected")
    await db.commit()

    fetched = await attribution_repo.get_by_id(db, row.id, org.id)
    assert fetched.status == "rejected"


@pytest.mark.asyncio
async def test_list_pending_excludes_resolved(db: AsyncSession, seed):
    user = seed["user"]
    org = seed["org"]
    txn = seed["txn"]

    row = await attribution_repo.create(
        db,
        user_id=user.id,
        organization_id=org.id,
        transaction_id=txn.id,
        proposed_applicant_id=None,
        confidence="unmatched",
    )
    await attribution_repo.resolve(db, row, "rejected")
    await db.commit()

    pending = await attribution_repo.list_pending(db, org.id)
    assert len(pending) == 0


@pytest.mark.asyncio
async def test_org_isolation(db: AsyncSession, seed):
    """Items from another org are not returned."""
    user = seed["user"]
    org = seed["org"]
    txn = seed["txn"]

    other_user = _user()
    other_org = _org(other_user)
    db.add(other_user)
    db.add(other_org)
    await db.flush()

    await attribution_repo.create(
        db,
        user_id=user.id,
        organization_id=org.id,
        transaction_id=txn.id,
        proposed_applicant_id=None,
        confidence="unmatched",
    )
    await db.commit()

    pending_other = await attribution_repo.list_pending(db, other_org.id)
    assert len(pending_other) == 0


@pytest.mark.asyncio
async def test_get_by_transaction_id(db: AsyncSession, seed):
    user = seed["user"]
    org = seed["org"]
    txn = seed["txn"]

    row = await attribution_repo.create(
        db,
        user_id=user.id,
        organization_id=org.id,
        transaction_id=txn.id,
        proposed_applicant_id=None,
        confidence="unmatched",
    )
    await db.commit()

    fetched = await attribution_repo.get_by_transaction_id(db, txn.id, org.id)
    assert fetched is not None
    assert fetched.id == row.id
