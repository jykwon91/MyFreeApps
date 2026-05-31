"""Service tests for the payer_alias learning loop.

Covers:
  - Pass 0 in ``maybe_attribute_payment`` auto-attributes via a learned alias
    even when the payer name does NOT match the tenant's legal name (a relative
    paying rent — the whole point of the feature).
  - A dangling alias (applicant deleted) falls through to name matching rather
    than attributing to a missing tenant.
  - ``confirm_review`` and ``attribute_manually`` write the alias so the next
    payment auto-attributes.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.transactions.payer_alias import PayerAlias
from app.models.transactions.rent_attribution_review_queue import (
    RentAttributionReviewQueue,
)
from app.models.transactions.transaction import Transaction
from app.repositories.transactions import payer_alias_repo
from app.services.transactions.attribution_service import (
    attribute_manually,
    confirm_review,
    maybe_attribute_payment,
)


def _make_fake_uow(session: AsyncSession):
    @asynccontextmanager
    async def _fake_uow():
        yield session

    return _fake_uow


async def _make_applicant(db, org_id, user_id, name="Prince Kapoor"):
    applicant = Applicant(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        stage="lease_signed", legal_name=name,
    )
    db.add(applicant)
    await db.flush()
    return applicant


async def _make_txn(db, org_id, user_id, payer_name="Tushar Kapoor", payer_handle=None):
    txn = Transaction(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        transaction_date=_dt.date(2026, 5, 1), tax_year=2026, amount="1600.00",
        transaction_type="income", category="uncategorized", status="approved",
        is_manual=False, payer_name=payer_name, payer_handle=payer_handle,
    )
    db.add(txn)
    await db.flush()
    return txn


@pytest.mark.asyncio
async def test_alias_pass0_auto_attributes_despite_name_mismatch(db: AsyncSession):
    """A learned alias attributes "Tushar Kapoor" -> tenant "Prince Kapoor"."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    prince = await _make_applicant(db, org_id, user_id, "Prince Kapoor")
    await payer_alias_repo.upsert(
        db, user_id=user_id, organization_id=org_id,
        payer_name="Tushar Kapoor", applicant_id=prince.id, source="manual_link",
    )
    txn = await _make_txn(db, org_id, user_id, payer_name="Tushar Kapoor")

    with patch(
        "app.services.transactions.attribution_service.receipt_service.create_pending_receipt_in_session",
        new_callable=AsyncMock,
    ) as receipt_mock:
        await maybe_attribute_payment(
            db, txn=txn, payer_name="Tushar Kapoor",
            organization_id=org_id, user_id=user_id,
        )

    assert txn.applicant_id == prince.id
    assert txn.attribution_source == "auto_alias"
    assert txn.category == "rental_revenue"
    receipt_mock.assert_awaited_once()
    # No review row — it auto-attributed.
    rows = (
        await db.execute(
            select(RentAttributionReviewQueue).where(
                RentAttributionReviewQueue.transaction_id == txn.id
            )
        )
    ).scalars().all()
    assert rows == []


@pytest.mark.asyncio
async def test_alias_to_missing_applicant_falls_through(db: AsyncSession):
    """A dangling alias does NOT attribute — it falls through to name matching."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    # Alias points to an applicant that does not exist (deleted). FK enforcement
    # is off in tests, so this dangling row is representable.
    db.add(PayerAlias(
        id=uuid.uuid4(), user_id=user_id, organization_id=org_id,
        normalized_payer_name="tushar kapoor", applicant_id=uuid.uuid4(),
        source="confirm",
    ))
    txn = await _make_txn(db, org_id, user_id, payer_name="Tushar Kapoor")
    await db.flush()

    with patch(
        "app.services.transactions.attribution_service.receipt_service.create_pending_receipt_in_session",
        new_callable=AsyncMock,
    ) as receipt_mock:
        await maybe_attribute_payment(
            db, txn=txn, payer_name="Tushar Kapoor",
            organization_id=org_id, user_id=user_id,
        )

    # Not attributed; no receipt; queued for review (no name candidates).
    assert txn.applicant_id is None
    receipt_mock.assert_not_awaited()
    rows = (
        await db.execute(
            select(RentAttributionReviewQueue).where(
                RentAttributionReviewQueue.transaction_id == txn.id
            )
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].confidence == "unmatched"


@pytest.mark.asyncio
async def test_alias_ambiguous_name_to_two_tenants_queues_review(db: AsyncSession):
    """A payer name learned for TWO tenants (no handle) → review, not a guess."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    prince = await _make_applicant(db, org_id, user_id, "Prince Kapoor")
    rahul = await _make_applicant(db, org_id, user_id, "Rahul Kapoor")
    for app_ in (prince, rahul):
        await payer_alias_repo.upsert(
            db, user_id=user_id, organization_id=org_id,
            payer_name="Tushar Kapoor", applicant_id=app_.id, source="confirm",
        )
    txn = await _make_txn(db, org_id, user_id, payer_name="Tushar Kapoor")

    with patch(
        "app.services.transactions.attribution_service.receipt_service.create_pending_receipt_in_session",
        new_callable=AsyncMock,
    ) as receipt_mock:
        await maybe_attribute_payment(
            db, txn=txn, payer_name="Tushar Kapoor",
            organization_id=org_id, user_id=user_id,
        )

    # Refused to guess — not attributed, no receipt, queued unmatched.
    assert txn.applicant_id is None
    receipt_mock.assert_not_awaited()
    rows = (
        await db.execute(
            select(RentAttributionReviewQueue).where(
                RentAttributionReviewQueue.transaction_id == txn.id
            )
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].confidence == "unmatched"


@pytest.mark.asyncio
async def test_alias_handle_disambiguates_two_same_name_payers(db: AsyncSession):
    """Two different "John Smith" payers; the incoming handle picks the right one."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    tenant_a = await _make_applicant(db, org_id, user_id, "Tenant A")
    tenant_b = await _make_applicant(db, org_id, user_id, "Tenant B")
    await payer_alias_repo.upsert(
        db, user_id=user_id, organization_id=org_id, payer_name="John Smith",
        applicant_id=tenant_a.id, source="manual_link", payer_handle="john.a@x.com",
    )
    await payer_alias_repo.upsert(
        db, user_id=user_id, organization_id=org_id, payer_name="John Smith",
        applicant_id=tenant_b.id, source="manual_link", payer_handle="john.b@x.com",
    )
    txn = await _make_txn(
        db, org_id, user_id, payer_name="John Smith", payer_handle="john.b@x.com"
    )

    with patch(
        "app.services.transactions.attribution_service.receipt_service.create_pending_receipt_in_session",
        new_callable=AsyncMock,
    ) as receipt_mock:
        await maybe_attribute_payment(
            db, txn=txn, payer_name="John Smith", payer_handle="john.b@x.com",
            organization_id=org_id, user_id=user_id,
        )

    assert txn.applicant_id == tenant_b.id
    assert txn.attribution_source == "auto_alias"
    receipt_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_confirm_review_writes_alias(db: AsyncSession):
    """Confirming a fuzzy/unmatched review against a tenant remembers the payer."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    prince = await _make_applicant(db, org_id, user_id, "Prince Kapoor")
    txn = await _make_txn(db, org_id, user_id, payer_name="Tushar Kapoor")
    review = RentAttributionReviewQueue(
        id=uuid.uuid4(), user_id=user_id, organization_id=org_id,
        transaction_id=txn.id, proposed_applicant_id=None,
        confidence="unmatched", status="pending",
    )
    db.add(review)
    await db.flush()

    with patch(
        "app.services.transactions.attribution_service.unit_of_work",
        _make_fake_uow(db),
    ), patch(
        "app.services.transactions.attribution_service.receipt_service.create_pending_receipt_in_session",
        new_callable=AsyncMock,
    ):
        result = await confirm_review(
            review_id=review.id, organization_id=org_id, user_id=user_id,
            applicant_id=prince.id,
        )

    assert result["ok"] is True
    alias = await payer_alias_repo.get_by_payer_name(
        db, organization_id=org_id, payer_name="Tushar Kapoor"
    )
    assert alias is not None
    assert alias.applicant_id == prince.id
    assert alias.source == "confirm"


@pytest.mark.asyncio
async def test_attribute_manually_writes_alias(db: AsyncSession):
    """Manually linking a payment to a tenant remembers the payer."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    prince = await _make_applicant(db, org_id, user_id, "Prince Kapoor")
    txn = await _make_txn(db, org_id, user_id, payer_name="Tushar Kapoor")

    with patch(
        "app.services.transactions.attribution_service.unit_of_work",
        _make_fake_uow(db),
    ), patch(
        "app.services.transactions.attribution_service.receipt_service.create_pending_receipt_in_session",
        new_callable=AsyncMock,
    ):
        result = await attribute_manually(
            transaction_id=txn.id, applicant_id=prince.id,
            organization_id=org_id, user_id=user_id,
        )

    assert result["ok"] is True
    alias = await payer_alias_repo.get_by_payer_name(
        db, organization_id=org_id, payer_name="Tushar Kapoor"
    )
    assert alias is not None
    assert alias.applicant_id == prince.id
    assert alias.source == "manual_link"


@pytest.mark.asyncio
async def test_confirm_review_writes_alias_with_handle(db: AsyncSession):
    """Confirming a txn that carried a payer_handle seeds the alias handle."""
    org_id, user_id = uuid.uuid4(), uuid.uuid4()
    prince = await _make_applicant(db, org_id, user_id, "Prince Kapoor")
    txn = await _make_txn(
        db, org_id, user_id, payer_name="John Smith", payer_handle="John.Smith@X.com"
    )
    review = RentAttributionReviewQueue(
        id=uuid.uuid4(), user_id=user_id, organization_id=org_id,
        transaction_id=txn.id, proposed_applicant_id=None,
        confidence="unmatched", status="pending",
    )
    db.add(review)
    await db.flush()

    with patch(
        "app.services.transactions.attribution_service.unit_of_work",
        _make_fake_uow(db),
    ), patch(
        "app.services.transactions.attribution_service.receipt_service.create_pending_receipt_in_session",
        new_callable=AsyncMock,
    ):
        await confirm_review(
            review_id=review.id, organization_id=org_id, user_id=user_id,
            applicant_id=prince.id,
        )

    alias = await payer_alias_repo.get_by_payer_name(
        db, organization_id=org_id, payer_name="John Smith"
    )
    assert alias is not None
    assert alias.applicant_id == prince.id
    assert alias.payer_handle == "john.smith@x.com"  # normalized
