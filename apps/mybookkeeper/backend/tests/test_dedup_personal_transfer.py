"""A second source for a personal transfer, or a duplicate merge, never un-marks it."""
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.transactions.transaction import Transaction
from app.models.user.user import User
from app.services.extraction.dedup_resolution_service import _copy_user_edits, handle_amount_conflict
from tests.test_duplicate_merge_carry_over import _keep, _merge, _payment


def _personal(prior: str = "approved") -> Transaction:
    return Transaction(
        status="personal_transfer", status_before_personal_transfer=prior,
        amount=Decimal("384.75"), category="uncategorized",
    )


def test_an_amount_conflict_flags_review_for_after_unmarking() -> None:
    txn = _personal()
    handle_amount_conflict(txn, Decimal("400.00"))
    assert txn.status == "personal_transfer"
    assert txn.status_before_personal_transfer == "needs_review"
    assert txn.review_fields == ["amount"]


def test_a_replacement_read_stays_a_personal_transfer() -> None:
    new = Transaction(status="unverified", category="uncategorized")
    _copy_user_edits(_personal(), new)
    assert new.status == "personal_transfer"
    assert new.status_before_personal_transfer == "unverified"


@pytest.mark.asyncio
async def test_merging_away_the_marked_copy_keeps_the_mark(
    db: AsyncSession, test_org: Organization, test_user: User,
) -> None:
    marked = _payment(test_org, test_user, status="personal_transfer", status_before_personal_transfer="pending")
    survivor = _payment(test_org, test_user, status="pending", description="Zelle from Dao")
    db.add_all([marked, survivor])
    await db.commit()

    result = await _merge(db, test_org, test_user, marked, survivor, survivor)

    assert result.status == "personal_transfer"
    # Merging is a review, so un-marking later puts it back as approved.
    assert result.status_before_personal_transfer == "approved"


@pytest.mark.asyncio
async def test_keeping_the_other_copy_keeps_the_mark(
    db: AsyncSession, test_org: Organization, test_user: User,
) -> None:
    marked = _payment(test_org, test_user, status="personal_transfer", status_before_personal_transfer="approved")
    kept = _payment(test_org, test_user, status="approved")
    db.add_all([marked, kept])
    await db.commit()

    await _keep(db, test_org, test_user, kept, [marked])

    await db.refresh(kept)
    assert kept.status == "personal_transfer"
    assert kept.status_before_personal_transfer == "approved"


@pytest.mark.asyncio
async def test_merging_two_unmarked_copies_marks_nothing(
    db: AsyncSession, test_org: Organization, test_user: User,
) -> None:
    removed = _payment(test_org, test_user, status="pending")
    survivor = _payment(test_org, test_user, status="pending")
    db.add_all([removed, survivor])
    await db.commit()

    result = await _merge(db, test_org, test_user, removed, survivor, survivor)

    assert result.status == "approved"
    assert result.status_before_personal_transfer is None
