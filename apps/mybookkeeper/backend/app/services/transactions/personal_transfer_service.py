"""Personal transfers: payments that are neither income nor spending.

A Zelle from a sibling or a friend paying the person back is real money on
file, but counting it as rent would overstate income and tax. Marking it a
personal transfer keeps the row and takes it out of every total (totals count
only ``approved`` rows), resolves its Payment Review card, and remembers the
sender so their later payments are marked on arrival.

The last decision about a sender wins. Marking remembers them; confirming or
linking one of their payments to a tenant forgets them again
(``forget_sender_of``), since payments are checked against remembered senders
before tenant aliases.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.attribution_review_statuses import REVIEW_PERSONAL
from app.core.tax_total_inputs import tax_total_inputs
from app.db.session import AsyncSessionLocal, unit_of_work
from app.models.transactions.transaction import Transaction
from app.repositories.leases import pending_rent_receipt_repo
from app.repositories.tax import tax_return_repo
from app.repositories.transactions import (
    attribution_repo,
    personal_transfer_sender_repo,
    transaction_repo,
)
from app.schemas.transactions.personal_transfer_mark_result import PersonalTransferMarkResult
from app.schemas.transactions.personal_transfer_sender_read import PersonalTransferSenderRead
from app.schemas.transactions.personal_transfer_unmark_result import PersonalTransferUnmarkResult
from app.services.transactions.personal_sender_matcher import find_matching_sender, sender_matches
from app.services.transactions.personal_transfer_status import (
    mark_personal_transfer,
    unmark_personal_transfer,
)


async def mark_if_remembered_sender(
    db: AsyncSession, txn: Transaction, organization_id: uuid.UUID,
) -> bool:
    """Mark a newly arrived payment when its sender is remembered. Returns whether it was.

    The caller flags tax returns and owns the commit.
    """
    senders = await personal_transfer_sender_repo.list_by_payer_name(db, organization_id, txn.payer_name)
    if find_matching_sender(senders, payer_name=txn.payer_name, payer_handle=txn.payer_handle) is None:
        return False
    mark_personal_transfer(txn)
    return True


async def forget_sender_of(db: AsyncSession, txn: Transaction, organization_id: uuid.UUID) -> int:
    """Forget every remembered sender this payment matches. Returns how many."""
    senders = await personal_transfer_sender_repo.list_by_payer_name(db, organization_id, txn.payer_name)
    matching = [
        s.id for s in senders
        if sender_matches(s, payer_name=txn.payer_name, payer_handle=txn.payer_handle)
    ]
    return await personal_transfer_sender_repo.delete_ids(db, matching, organization_id)


async def mark(
    *, transaction_id: uuid.UUID, organization_id: uuid.UUID, user_id: uuid.UUID,
) -> PersonalTransferMarkResult:
    """Mark a transaction a personal transfer, remember its sender, and clear
    that sender's other open Payment Review cards. Idempotent.

    Any live row can be marked (paying a friend back is a personal transfer
    too); only a payment that names its sender teaches a rule.

    Raises ``ValueError`` when the transaction is missing or deleted.
    """
    async with unit_of_work() as db:
        txn = await _lock_live(db, transaction_id, organization_id)
        await _mark_one(db, txn, organization_id)

        remembered = None
        also_cleared = 0
        if txn.payer_name and txn.payer_name.strip():
            sender = await personal_transfer_sender_repo.remember(
                db,
                organization_id=organization_id,
                created_by_user_id=user_id,
                payer_name=txn.payer_name,
                payer_handle=txn.payer_handle,
            )
            remembered = PersonalTransferSenderRead.model_validate(sender)
            for card in await attribution_repo.list_open_with_payer(db, organization_id):
                other = card.transaction
                if other.id == txn.id or not sender_matches(
                    sender, payer_name=other.payer_name, payer_handle=other.payer_handle,
                ):
                    continue
                locked = await transaction_repo.lock_live_transactions(db, [other.id], organization_id)
                if locked:
                    await _mark_one(db, locked[0], organization_id)
                    also_cleared += 1
        return PersonalTransferMarkResult(
            transaction_id=txn.id, remembered_sender=remembered, also_cleared=also_cleared,
        )


async def unmark(
    *, transaction_id: uuid.UUID, organization_id: uuid.UUID, forget_sender: bool,
) -> PersonalTransferUnmarkResult:
    """Put a personal transfer back to the status it had, reopening its card.

    Raises ``ValueError`` when the transaction is missing, deleted or not marked.
    """
    async with unit_of_work() as db:
        txn = await _lock_live(db, transaction_id, organization_id)
        old_tax_inputs = tax_total_inputs(txn)
        unmark_personal_transfer(txn)
        back_in_review = await attribution_repo.reopen_personal_for_transaction(
            db, transaction_id=txn.id, organization_id=organization_id,
        )
        forgotten = await forget_sender_of(db, txn, organization_id) if forget_sender else 0
        await tax_return_repo.flag_unfiled_if_totals_moved(db, txn, old_tax_inputs)
        return PersonalTransferUnmarkResult(
            transaction_id=txn.id,
            status=txn.status,
            back_in_review=back_in_review,
            forgotten_senders=forgotten,
        )


async def list_senders(organization_id: uuid.UUID) -> list[PersonalTransferSenderRead]:
    async with AsyncSessionLocal() as db:
        rows = await personal_transfer_sender_repo.list_for_organization(db, organization_id)
        return [PersonalTransferSenderRead.model_validate(r) for r in rows]


async def forget_sender(*, sender_id: uuid.UUID, organization_id: uuid.UUID) -> bool:
    """Stop marking this sender's future payments. Payments already marked stay marked."""
    async with unit_of_work() as db:
        return await personal_transfer_sender_repo.delete_by_id(db, sender_id, organization_id)


async def _lock_live(db: AsyncSession, transaction_id: uuid.UUID, organization_id: uuid.UUID) -> Transaction:
    locked = await transaction_repo.lock_live_transactions(db, [transaction_id], organization_id)
    if not locked:
        raise ValueError("Transaction not found")
    return locked[0]


async def _mark_one(db: AsyncSession, txn: Transaction, organization_id: uuid.UUID) -> None:
    """Mark one locked row: status, its open card, its unsent receipt, tax returns."""
    old_tax_inputs = tax_total_inputs(txn)
    mark_personal_transfer(txn)
    await attribution_repo.resolve_pending_for_transaction(
        db, transaction_id=txn.id, organization_id=organization_id, status=REVIEW_PERSONAL,
    )
    await pending_rent_receipt_repo.dismiss_pending_for_transactions(
        db,
        transaction_ids=[txn.id],
        organization_id=organization_id,
        dismissed_at=datetime.now(timezone.utc),
    )
    await tax_return_repo.flag_unfiled_if_totals_moved(db, txn, old_tax_inputs)
