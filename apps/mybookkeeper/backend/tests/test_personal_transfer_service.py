"""Marking payments as personal transfers, remembering senders, and undoing both."""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.transactions.personal_transfer_sender import PersonalTransferSender
from app.models.transactions.rent_attribution_review_queue import RentAttributionReviewQueue
from app.models.transactions.transaction import Transaction
from app.repositories.transactions import attribution_repo, personal_transfer_sender_repo
from app.repositories.transactions.transaction_bulk_repo import soft_delete_transactions
from app.services.transactions import attribution_service, personal_transfer_service

_SERVICE = "app.services.transactions.personal_transfer_service"
_ATTRIBUTION = "app.services.transactions.attribution_service"


def _fake_uow(session: AsyncSession):
    @asynccontextmanager
    async def _uow():
        yield session

    return _uow


@pytest.fixture
def org() -> tuple[uuid.UUID, uuid.UUID]:
    return uuid.uuid4(), uuid.uuid4()


@pytest.fixture(autouse=True)
def _session(db: AsyncSession):
    with (
        patch(f"{_SERVICE}.unit_of_work", _fake_uow(db)),
        patch(f"{_SERVICE}.AsyncSessionLocal", _fake_uow(db)),
        patch(f"{_ATTRIBUTION}.unit_of_work", _fake_uow(db)),
        patch(f"{_ATTRIBUTION}.AsyncSessionLocal", _fake_uow(db)),
        patch(f"{_ATTRIBUTION}.receipt_service.create_pending_receipt_in_session", new_callable=AsyncMock),
    ):
        yield


async def _payment(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, *,
    payer: str | None = "Dao Nguyen", handle: str | None = None, status: str = "unverified",
    queued: bool = True,
) -> Transaction:
    txn = Transaction(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        transaction_date=_dt.date(2026, 11, 1), tax_year=2026, amount="384.75",
        transaction_type="income", category="uncategorized", status=status,
        is_manual=False, payer_name=payer, payer_handle=handle,
    )
    db.add(txn)
    await db.flush()
    if queued:
        await attribution_repo.create(
            db, user_id=user_id, organization_id=org_id, transaction_id=txn.id,
            proposed_applicant_id=None, confidence="unmatched",
        )
    return txn


async def _card(db: AsyncSession, txn: Transaction) -> RentAttributionReviewQueue:
    return (await db.execute(
        select(RentAttributionReviewQueue).where(RentAttributionReviewQueue.transaction_id == txn.id)
    )).scalar_one()


async def _senders(db: AsyncSession, org_id: uuid.UUID) -> list[PersonalTransferSender]:
    return list(await personal_transfer_sender_repo.list_for_organization(db, org_id))


@pytest.mark.asyncio
async def test_mark_takes_it_out_of_review_and_remembers_the_sender(db: AsyncSession, org) -> None:
    org_id, user_id = org
    txn = await _payment(db, org_id, user_id, handle="Dao@Example.com")

    result = await personal_transfer_service.mark(
        transaction_id=txn.id, organization_id=org_id, user_id=user_id,
    )

    assert txn.status == "personal_transfer"
    assert txn.status_before_personal_transfer == "unverified"
    assert (await _card(db, txn)).status == "personal"
    assert result.remembered_sender is not None
    assert result.remembered_sender.display_name == "Dao Nguyen"
    assert result.also_cleared == 0
    [sender] = await _senders(db, org_id)
    assert (sender.normalized_payer_name, sender.payer_handle) == ("dao nguyen", "dao@example.com")
    assert await attribution_repo.count_pending(db, org_id) == 0


@pytest.mark.asyncio
async def test_mark_clears_that_senders_other_cards_only(db: AsyncSession, org) -> None:
    org_id, user_id = org
    first = await _payment(db, org_id, user_id)
    same_sender = await _payment(db, org_id, user_id, payer="DAO  NGUYEN")
    same_name_other_handle = await _payment(db, org_id, user_id, handle="other@example.com")
    stranger = await _payment(db, org_id, user_id, payer="Kim Tran")
    # The first payment has no handle, so the rule it teaches matches any handle.
    result = await personal_transfer_service.mark(
        transaction_id=first.id, organization_id=org_id, user_id=user_id,
    )

    assert result.also_cleared == 2
    assert same_sender.status == "personal_transfer"
    assert same_name_other_handle.status == "personal_transfer"
    assert stranger.status == "unverified"
    assert (await _card(db, stranger)).status == "pending"
    assert await attribution_repo.count_pending(db, org_id) == 1


@pytest.mark.asyncio
async def test_a_handled_rule_leaves_a_same_named_stranger_in_review(db: AsyncSession, org) -> None:
    org_id, user_id = org
    first = await _payment(db, org_id, user_id, handle="dao@example.com")
    other_dao = await _payment(db, org_id, user_id, handle="other@example.com")

    result = await personal_transfer_service.mark(
        transaction_id=first.id, organization_id=org_id, user_id=user_id,
    )

    assert result.also_cleared == 0
    assert other_dao.status == "unverified"


@pytest.mark.asyncio
async def test_marking_twice_is_harmless(db: AsyncSession, org) -> None:
    org_id, user_id = org
    txn = await _payment(db, org_id, user_id, status="approved")
    for _ in range(2):
        await personal_transfer_service.mark(transaction_id=txn.id, organization_id=org_id, user_id=user_id)
    assert txn.status_before_personal_transfer == "approved"
    assert len(await _senders(db, org_id)) == 1


@pytest.mark.asyncio
async def test_a_payment_with_no_sender_is_marked_without_a_rule(db: AsyncSession, org) -> None:
    org_id, user_id = org
    txn = await _payment(db, org_id, user_id, payer=None, queued=False, status="approved")
    result = await personal_transfer_service.mark(
        transaction_id=txn.id, organization_id=org_id, user_id=user_id,
    )
    assert txn.status == "personal_transfer"
    assert result.remembered_sender is None
    assert await _senders(db, org_id) == []


@pytest.mark.asyncio
async def test_marking_a_missing_transaction_raises(db: AsyncSession, org) -> None:
    org_id, user_id = org
    with pytest.raises(ValueError, match="not found"):
        await personal_transfer_service.mark(transaction_id=uuid.uuid4(), organization_id=org_id, user_id=user_id)
    other_org_txn = await _payment(db, uuid.uuid4(), user_id)
    with pytest.raises(ValueError, match="not found"):
        await personal_transfer_service.mark(transaction_id=other_org_txn.id, organization_id=org_id, user_id=user_id)


@pytest.mark.asyncio
async def test_unmark_restores_the_status_and_reopens_the_card(db: AsyncSession, org) -> None:
    org_id, user_id = org
    txn = await _payment(db, org_id, user_id)
    await personal_transfer_service.mark(transaction_id=txn.id, organization_id=org_id, user_id=user_id)

    result = await personal_transfer_service.unmark(
        transaction_id=txn.id, organization_id=org_id, forget_sender=False,
    )

    assert result.status == "unverified"
    assert result.back_in_review is True
    assert result.forgotten_senders == 0
    assert txn.status_before_personal_transfer is None
    assert (await _card(db, txn)).status == "pending"
    assert len(await _senders(db, org_id)) == 1


@pytest.mark.asyncio
async def test_unmark_can_forget_the_sender_too(db: AsyncSession, org) -> None:
    org_id, user_id = org
    txn = await _payment(db, org_id, user_id)
    await personal_transfer_service.mark(transaction_id=txn.id, organization_id=org_id, user_id=user_id)

    result = await personal_transfer_service.unmark(
        transaction_id=txn.id, organization_id=org_id, forget_sender=True,
    )

    assert result.forgotten_senders == 1
    assert await _senders(db, org_id) == []


@pytest.mark.asyncio
async def test_unmarking_an_unmarked_transaction_raises(db: AsyncSession, org) -> None:
    org_id, user_id = org
    txn = await _payment(db, org_id, user_id)
    with pytest.raises(ValueError, match="isn't marked"):
        await personal_transfer_service.unmark(transaction_id=txn.id, organization_id=org_id, forget_sender=False)


@pytest.mark.asyncio
async def test_a_remembered_senders_next_payment_skips_review(db: AsyncSession, org) -> None:
    org_id, user_id = org
    first = await _payment(db, org_id, user_id)
    await personal_transfer_service.mark(transaction_id=first.id, organization_id=org_id, user_id=user_id)
    nxt = await _payment(db, org_id, user_id, payer=None, queued=False)

    await attribution_service.maybe_attribute_payment(
        db, txn=nxt, payer_name="dao nguyen", payer_handle="dao@example.com",
        organization_id=org_id, user_id=user_id,
    )

    assert nxt.status == "personal_transfer"
    assert nxt.status_before_personal_transfer == "unverified"
    assert await attribution_repo.get_by_transaction_id(db, nxt.id, org_id) is None


@pytest.mark.asyncio
async def test_a_forgotten_senders_next_payment_is_reviewed_again(db: AsyncSession, org) -> None:
    org_id, user_id = org
    first = await _payment(db, org_id, user_id)
    marked = await personal_transfer_service.mark(transaction_id=first.id, organization_id=org_id, user_id=user_id)
    assert marked.remembered_sender is not None
    assert await personal_transfer_service.forget_sender(
        sender_id=marked.remembered_sender.id, organization_id=org_id,
    )
    nxt = await _payment(db, org_id, user_id, payer=None, queued=False)

    await attribution_service.maybe_attribute_payment(
        db, txn=nxt, payer_name="Dao Nguyen", organization_id=org_id, user_id=user_id,
    )

    assert nxt.status == "unverified"
    assert (await _card(db, nxt)).status == "pending"
    # The payment already marked stays marked.
    assert first.status == "personal_transfer"


@pytest.mark.asyncio
async def test_forgetting_another_orgs_sender_is_refused(db: AsyncSession, org) -> None:
    org_id, user_id = org
    sender = await personal_transfer_sender_repo.remember(
        db, organization_id=uuid.uuid4(), created_by_user_id=None, payer_name="Dao", payer_handle=None,
    )
    assert not await personal_transfer_service.forget_sender(sender_id=sender.id, organization_id=org_id)
    assert await personal_transfer_service.list_senders(org_id) == []


@pytest.mark.asyncio
async def test_linking_a_senders_payment_to_a_tenant_forgets_the_sender(db: AsyncSession, org) -> None:
    org_id, user_id = org
    first = await _payment(db, org_id, user_id)
    await personal_transfer_service.mark(transaction_id=first.id, organization_id=org_id, user_id=user_id)
    rent = await _payment(db, org_id, user_id, payer="Dao Nguyen", queued=False)
    rent.status = "pending"  # arrived before the rule, so it was never marked
    tenant = Applicant(
        id=uuid.uuid4(), organization_id=org_id, user_id=user_id, stage="lease_signed", legal_name="Dao Nguyen",
    )
    db.add(tenant)
    await db.flush()

    await attribution_service.attribute_manually(
        transaction_id=rent.id, applicant_id=tenant.id, organization_id=org_id, user_id=user_id,
    )

    assert await _senders(db, org_id) == []


@pytest.mark.asyncio
async def test_a_personal_transfer_cannot_be_linked_to_a_tenant(db: AsyncSession, org) -> None:
    org_id, user_id = org
    txn = await _payment(db, org_id, user_id)
    await personal_transfer_service.mark(transaction_id=txn.id, organization_id=org_id, user_id=user_id)
    with pytest.raises(ValueError, match="personal transfer"):
        await attribution_service.attribute_manually(
            transaction_id=txn.id, applicant_id=uuid.uuid4(), organization_id=org_id, user_id=user_id,
        )


@pytest.mark.asyncio
async def test_review_list_hides_deleted_and_personal_payments(db: AsyncSession, org) -> None:
    """A card left open for a payment that's gone or personal is never shown."""
    org_id, user_id = org
    shown = await _payment(db, org_id, user_id, payer="Kim Tran")
    deleted = await _payment(db, org_id, user_id, payer="Lee Park")
    personal = await _payment(db, org_id, user_id, payer="Ana Ruiz")
    deleted.deleted_at = _dt.datetime.now(_dt.timezone.utc)
    personal.status_before_personal_transfer = personal.status
    personal.status = "personal_transfer"
    await db.flush()

    items = await attribution_repo.list_pending(db, org_id)

    assert [i.transaction_id for i in items] == [shown.id]
    assert await attribution_repo.count_pending(db, org_id) == 1


@pytest.mark.asyncio
async def test_deleting_a_payment_dismisses_its_card(db: AsyncSession, org) -> None:
    org_id, user_id = org
    txn = await _payment(db, org_id, user_id)
    await soft_delete_transactions(db, [txn])
    card = await _card(db, txn)
    assert card.status == "dismissed"
    assert card.resolved_at is not None
